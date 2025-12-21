pub mod queries;
pub mod schema;

pub use queries::{
    SearchSortField, SortOrder, delete_by_paths, get_file_by_path, get_files_by_ids,
    get_last_indexed_at, get_metadata_for_paths, list_indexed_paths, rename_path,
    update_media_metadata, upsert_file, vacuum,
};
pub use schema::init_db;
