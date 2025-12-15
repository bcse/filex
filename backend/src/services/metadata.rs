use serde::Deserialize;
use std::path::Path;
use std::time::Duration;
use thiserror::Error;
use tokio::process::Command;

use crate::models::MediaMetadata;

#[derive(Error, Debug)]
pub enum MetadataError {
    #[error("ffprobe not found - ensure FFmpeg is installed")]
    FfprobeNotFound,

    #[error("Failed to execute ffprobe: {0}")]
    ExecutionFailed(String),

    #[error("Failed to parse ffprobe output: {0}")]
    ParseError(String),

    #[error("Not a media file")]
    NotMediaFile,

    #[error("ffprobe timed out")]
    Timeout,
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    streams: Option<Vec<FfprobeStream>>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    format_name: Option<String>,
    duration: Option<String>,
}

pub struct MetadataService;

impl MetadataService {
    // ffprobe sometimes hangs on malformed files, so guard the call with a timeout
    const FFPROBE_TIMEOUT: Duration = Duration::from_secs(15);

    /// Extract media metadata using ffprobe
    pub async fn extract(path: &Path) -> Result<MediaMetadata, MetadataError> {
        // Check if file might be a media file based on extension
        if !Self::is_likely_media_file(path) {
            return Err(MetadataError::NotMediaFile);
        }

        let mut command = Command::new("ffprobe");
        command
            .kill_on_drop(true)
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
            ])
            .arg(path);

        let child = command.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                MetadataError::FfprobeNotFound
            } else {
                MetadataError::ExecutionFailed(e.to_string())
            }
        })?;

        let mut child_opt = Some(child);
        let output = tokio::select! {
            res = async {
                // Safe to unwrap: this branch is exclusive and consumes the child.
                child_opt.take().unwrap().wait_with_output().await
            } => res.map_err(|e| MetadataError::ExecutionFailed(e.to_string()))?,
            _ = tokio::time::sleep(Self::FFPROBE_TIMEOUT) => {
                if let Some(mut child) = child_opt.take() {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                }
                return Err(MetadataError::Timeout);
            }
        };

        if !output.status.success() {
            return Err(MetadataError::ExecutionFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        let ffprobe_data: FfprobeOutput = serde_json::from_slice(&output.stdout)
            .map_err(|e| MetadataError::ParseError(e.to_string()))?;

        let mut metadata = MediaMetadata::default();

        // Extract from format
        if let Some(format) = ffprobe_data.format {
            metadata.format = format.format_name;
            if let Some(dur) = format.duration {
                metadata.duration = dur.parse().ok();
            }
        }

        // Extract from streams (prefer video stream for dimensions)
        if let Some(streams) = ffprobe_data.streams {
            for stream in streams {
                if stream.codec_type.as_deref() == Some("video") {
                    metadata.width = stream.width;
                    metadata.height = stream.height;
                    metadata.codec = stream.codec_name;

                    // Video stream duration takes precedence
                    if let Some(dur) = stream.duration {
                        if let Ok(d) = dur.parse::<f64>() {
                            metadata.duration = Some(d);
                        }
                    }
                    break;
                } else if stream.codec_type.as_deref() == Some("audio")
                    && metadata.duration.is_none()
                {
                    // Use audio duration if no video stream
                    if let Some(dur) = stream.duration {
                        metadata.duration = dur.parse().ok();
                    }
                    if metadata.codec.is_none() {
                        metadata.codec = stream.codec_name;
                    }
                }
            }
        }

        Ok(metadata)
    }

    /// Check if file extension suggests it might be a media file
    fn is_likely_media_file(path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        match ext.as_deref() {
            // Images
            Some(
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tiff" | "tif" | "svg" | "ico"
                | "heic" | "heif" | "avif",
            ) => true,
            // Videos
            Some(
                "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpeg" | "mpg"
                | "3gp" | "ts" | "mts",
            ) => true,
            // Audio
            Some("mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" | "opus" | "aiff") => true,
            _ => false,
        }
    }

    /// Check if ffprobe is available
    pub fn is_available() -> bool {
        std::process::Command::new("ffprobe")
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_file_detection() {
        assert!(MetadataService::is_likely_media_file(Path::new(
            "video.mp4"
        )));
        assert!(MetadataService::is_likely_media_file(Path::new(
            "image.jpg"
        )));
        assert!(MetadataService::is_likely_media_file(Path::new(
            "audio.mp3"
        )));
        assert!(!MetadataService::is_likely_media_file(Path::new(
            "document.pdf"
        )));
        assert!(!MetadataService::is_likely_media_file(Path::new("code.rs")));
    }
}
