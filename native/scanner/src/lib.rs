use ignore::{DirEntry, WalkBuilder, WalkState};
use napi::bindgen_prelude::{AbortSignal, AsyncTask, Function};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, Result, Status, Task};
use napi_derive::napi;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

const DEFAULT_MAX_DEPTH: u32 = 3;
const DEFAULT_MAX_REPOS: u32 = 100;
const DEFAULT_TIMEOUT_MS: u32 = 10_000;

#[napi(object)]
pub struct ScanOptions {
    pub max_depth: Option<u32>,
    pub max_repos: Option<u32>,
    pub timeout_ms: Option<u32>,
}

#[napi(object)]
#[derive(Clone)]
pub struct DiscoveredRepository {
    pub worktree: String,
    pub remote_url: String,
    pub current_branch: Option<String>,
}

#[napi(object)]
pub struct ScanResult {
    pub repositories: Vec<DiscoveredRepository>,
    pub warnings: Vec<String>,
    pub truncated: bool,
    pub timed_out: bool,
    pub stopped: bool,
    pub duration_ms: f64,
    pub max_depth: u32,
    pub max_repos: u32,
    pub timeout_ms: u32,
}

struct NormalizedOptions {
    max_depth: u32,
    max_repos: u32,
    timeout_ms: u32,
}

impl From<Option<ScanOptions>> for NormalizedOptions {
    fn from(options: Option<ScanOptions>) -> Self {
        let options = options.unwrap_or(ScanOptions {
            max_depth: None,
            max_repos: None,
            timeout_ms: None,
        });
        Self {
            max_depth: options.max_depth.unwrap_or(DEFAULT_MAX_DEPTH).clamp(1, 8),
            max_repos: options
                .max_repos
                .unwrap_or(DEFAULT_MAX_REPOS)
                .clamp(1, 100_000),
            timeout_ms: options
                .timeout_ms
                .unwrap_or(DEFAULT_TIMEOUT_MS)
                .clamp(1, 30_000),
        }
    }
}

fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn git_directory(worktree: &Path) -> Option<PathBuf> {
    let marker = worktree.join(".git");
    let metadata = fs::symlink_metadata(&marker).ok()?;
    if metadata.is_dir() {
        return Some(marker);
    }
    if !metadata.is_file() {
        return None;
    }

    let content = read_text(&marker)?;
    let gitdir = content.lines().find_map(|line| {
        line.trim()
            .strip_prefix("gitdir:")
            .map(|value| value.trim())
    })?;
    let path = PathBuf::from(gitdir);
    Some(if path.is_absolute() {
        path
    } else {
        worktree.join(path)
    })
}

fn bare_git_directory(worktree: &Path) -> Option<PathBuf> {
    let is_file = |name: &str| worktree.join(name).is_file();
    let is_dir = |name: &str| worktree.join(name).is_dir();
    (is_file("HEAD") && is_dir("objects") && is_dir("refs")).then(|| worktree.to_path_buf())
}

fn origin_remote(config: &str) -> Option<String> {
    let mut in_origin = false;
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_origin = trimmed == "[remote \"origin\"]";
            continue;
        }
        if in_origin {
            if let Some((key, value)) = trimmed.split_once('=') {
                if key.trim() == "url" {
                    return Some(value.trim().to_owned());
                }
            }
        }
    }
    None
}

fn current_branch(git_directory: &Path) -> Option<String> {
    read_text(&git_directory.join("HEAD"))?
        .trim()
        .strip_prefix("ref: refs/heads/")
        .map(str::to_owned)
}

fn discover_repository_path(worktree: &Path) -> Option<DiscoveredRepository> {
    let worktree = worktree.to_path_buf();
    let git_directory = git_directory(&worktree).or_else(|| bare_git_directory(&worktree))?;
    let config = read_text(&git_directory.join("config"))?;
    let remote_url = origin_remote(&config)?;
    Some(DiscoveredRepository {
        worktree: worktree.to_string_lossy().into_owned(),
        remote_url,
        current_branch: current_branch(&git_directory),
    })
}

fn should_visit(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    !matches!(
        name.as_ref(),
        ".git"
            | ".hg"
            | ".svn"
            | ".jj"
            | "node_modules"
            | "vendor"
            | "dist"
            | "build"
            | ".cache"
            | ".turbo"
            | "__pycache__"
    )
}

type ProgressCallback =
    ThreadsafeFunction<DiscoveredRepository, (), (DiscoveredRepository,), Status, false>;

fn scan(
    root: &Path,
    options: NormalizedOptions,
    aborted: &AtomicBool,
    progress: Option<&Arc<ProgressCallback>>,
) -> ScanResult {
    let started = Instant::now();
    let deadline = Duration::from_millis(options.timeout_ms.into());
    let repositories = Arc::new(Mutex::new(Vec::new()));
    let warnings = Arc::new(Mutex::new(Vec::new()));
    let truncated = Arc::new(AtomicBool::new(false));
    let timed_out = Arc::new(AtomicBool::new(false));

    if !root.is_dir() {
        let warning = format!("Folder does not exist: {}", root.display());
        return ScanResult {
            repositories: Vec::new(),
            warnings: vec![warning],
            truncated: false,
            timed_out: false,
            stopped: aborted.load(Ordering::Relaxed),
            duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
            max_depth: options.max_depth,
            max_repos: options.max_repos,
            timeout_ms: options.timeout_ms,
        };
    }

    let mut builder = WalkBuilder::new(root);
    builder
        .max_depth(Some(options.max_depth as usize))
        .hidden(true)
        .follow_links(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .sort_by_file_name(|left, right| left.cmp(right))
        .filter_entry(should_visit);

    let repository_count = Arc::new(AtomicUsize::new(0));
    let progress = progress.cloned();
    builder.build_parallel().run(|| {
        let repositories = Arc::clone(&repositories);
        let warnings = Arc::clone(&warnings);
        let truncated = Arc::clone(&truncated);
        let timed_out = Arc::clone(&timed_out);
        let repository_count = Arc::clone(&repository_count);
        let progress = progress.clone();

        Box::new(move |entry| {
            if aborted.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }
            if started.elapsed() >= deadline {
                timed_out.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }
            if repository_count.load(Ordering::Relaxed) >= options.max_repos as usize {
                truncated.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }

            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    if let Ok(mut warnings) = warnings.lock() {
                        warnings.push(error.to_string());
                    }
                    return WalkState::Continue;
                }
            };
            if entry.depth() == 0 || !entry.file_type().is_some_and(|kind| kind.is_dir()) {
                return WalkState::Continue;
            }

            let Some(repository) = discover_repository_path(entry.path()) else {
                return WalkState::Continue;
            };
            let slot = repository_count.fetch_add(1, Ordering::Relaxed);
            if slot >= options.max_repos as usize {
                repository_count.fetch_sub(1, Ordering::Relaxed);
                truncated.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }

            if let Some(callback) = progress.as_ref() {
                callback.call(repository.clone(), ThreadsafeFunctionCallMode::Blocking);
            }
            if let Ok(mut repositories) = repositories.lock() {
                repositories.push(repository);
            }
            WalkState::Skip
        })
    });

    let mut repositories = repositories
        .lock()
        .map(|items| items.clone())
        .unwrap_or_default();
    let warnings = warnings
        .lock()
        .map(|items| items.clone())
        .unwrap_or_default();
    repositories.sort_by(|left, right| left.worktree.cmp(&right.worktree));
    ScanResult {
        repositories,
        warnings,
        truncated: truncated.load(Ordering::Relaxed),
        timed_out: timed_out.load(Ordering::Relaxed),
        stopped: aborted.load(Ordering::Relaxed),
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
        max_depth: options.max_depth,
        max_repos: options.max_repos,
        timeout_ms: options.timeout_ms,
    }
}

pub struct ScanTask {
    root: PathBuf,
    options: NormalizedOptions,
    aborted: Arc<AtomicBool>,
    progress: Option<Arc<ProgressCallback>>,
}

impl Task for ScanTask {
    type Output = ScanResult;
    type JsValue = ScanResult;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(scan(
            &self.root,
            std::mem::replace(
                &mut self.options,
                NormalizedOptions {
                    max_depth: DEFAULT_MAX_DEPTH,
                    max_repos: DEFAULT_MAX_REPOS,
                    timeout_ms: DEFAULT_TIMEOUT_MS,
                },
            ),
            &self.aborted,
            self.progress.as_ref(),
        ))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn discover_repository(directory: String) -> Option<DiscoveredRepository> {
    discover_repository_path(Path::new(&directory))
}

#[napi]
pub fn scan_clone_directory_repositories(
    directory: String,
    options: Option<ScanOptions>,
    signal: Option<AbortSignal>,
    progress: Option<Function<'_, (DiscoveredRepository,), ()>>,
) -> Result<AsyncTask<ScanTask>> {
    let aborted = Arc::new(AtomicBool::new(false));
    if let Some(signal) = signal.as_ref() {
        let aborted = Arc::clone(&aborted);
        signal.on_abort(move || aborted.store(true, Ordering::Relaxed));
    }
    let progress = progress
        .map(|callback| {
            callback
                .build_threadsafe_function::<DiscoveredRepository>()
                .build_callback(|context| Ok((context.value,)))
        })
        .transpose()?
        .map(Arc::new);
    Ok(AsyncTask::new(ScanTask {
        root: PathBuf::from(directory),
        options: options.into(),
        aborted,
        progress,
    }))
}
