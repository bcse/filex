fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let out_dir = std::env::var("OUT_DIR").unwrap();
        let swift_source = "src/quicklook.swift";

        println!("cargo:rerun-if-changed={swift_source}");

        // Compile Swift to a static library
        let status = Command::new("swiftc")
            .args([
                "-emit-library",
                "-static",
                "-O",
                "-o",
                &format!("{out_dir}/libfilex_quicklook.a"),
                swift_source,
            ])
            .status()
            .expect("Failed to execute swiftc");

        if !status.success() {
            panic!("Swift compilation failed");
        }

        println!("cargo:rustc-link-search=native={out_dir}");
        println!("cargo:rustc-link-lib=static=filex_quicklook");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Quartz");
    }
}
