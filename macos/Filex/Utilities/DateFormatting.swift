import Foundation

/// Utility functions for date formatting
enum DateFormatting {
    /// Standard date formatter for file dates (YYYY-MM-DD HH:mm)
    private static let standardFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter
    }()

    /// Short date formatter (MM/DD/YY)
    private static let shortFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        return formatter
    }()

    /// Relative date formatter
    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    /// Format date in standard format (YYYY-MM-DD HH:mm)
    static func formatStandard(_ date: Date?) -> String {
        guard let date = date else { return "-" }
        return standardFormatter.string(from: date)
    }

    /// Format date in short format (MM/DD/YY)
    static func formatShort(_ date: Date?) -> String {
        guard let date = date else { return "-" }
        return shortFormatter.string(from: date)
    }

    /// Format date as relative time (e.g., "2 hours ago")
    static func formatRelative(_ date: Date?) -> String {
        guard let date = date else { return "-" }
        return relativeFormatter.localizedString(for: date, relativeTo: Date())
    }

    /// Format date intelligently based on age
    /// - Recent (< 1 week): relative time
    /// - Older: standard format
    static func formatSmart(_ date: Date?) -> String {
        guard let date = date else { return "-" }

        let oneWeekAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date())!

        if date > oneWeekAgo {
            return relativeFormatter.localizedString(for: date, relativeTo: Date())
        } else {
            return standardFormatter.string(from: date)
        }
    }

    /// Format duration in human-readable format
    static func formatDuration(_ seconds: Double?) -> String {
        guard let seconds = seconds else { return "-" }
        guard seconds > 0 else { return "0:00" }

        let totalSeconds = Int(seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%d:%02d", minutes, secs)
        }
    }

    /// Format resolution for images/videos
    static func formatResolution(_ width: Int?, _ height: Int?) -> String {
        guard let w = width, let h = height else { return "-" }
        return "\(w)x\(h)"
    }
}
