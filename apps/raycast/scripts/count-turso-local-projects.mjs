import { createClient } from '@libsql/client/web';
import raggleLocal from '@raggle-ai/local';

const { loadLocalProjects } = raggleLocal;

const url = process.env.TURSO_DATABASE_URL || 'libsql://raggle-raycast-projects-anduimagui.aws-eu-west-1.turso.io';
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!authToken) {
  console.error('Set TURSO_AUTH_TOKEN environment variable');
  process.exit(1);
}

const cloneDirectory = process.env.CLONE_DIRECTORY || '/Users/andrewmagu/src';

const client = createClient({ url, authToken });

function rowToRemoteProject(row) {
  return {
    remoteUrl: row.url,
    name: row.name || undefined,
    description: row.description || undefined,
    tags: parseJson(row.tags_json),
    folders: parseJson(row.folders_json),
    subpaths: parseSubpaths(row.subpaths_json),
    clonePathTemplate: row.clone_path_template || undefined,
    allSubpath: row.all_subpath === 1,
    removePathFromName: row.remove_path_from_name === 1,
  };
}

function parseJson(input) {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseSubpaths(input) {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === 'string') return { path: item };
      if (item && typeof item === 'object') {
        return {
          path: String(item.path || ''),
          allSubpath: item.allSubpath === true,
          removePathFromName: item.removePathFromName === true,
        };
      }
      return { path: String(item) };
    }).filter((item) => item.path);
  } catch {
    return [];
  }
}

async function main() {
  console.log(`Database: ${url}`);
  console.log(`Clone directory: ${cloneDirectory}`);

  const result = await client.execute(
    `select url, name, description, tags_json, folders_json, subpaths_json, clone_path_template, all_subpath, remove_path_from_name
     from projects
     where deleted_at is null
     order by coalesce(name, url), url`
  );

  const remoteProjects = result.rows.map(rowToRemoteProject);
  console.log(`\nTurso projects: ${remoteProjects.length}`);

  const localProjects = await loadLocalProjects(remoteProjects, {
    cloneDirectory,
  });

  console.log(`Local projects returned: ${localProjects.length}`);

  const cloned = localProjects.filter((p) => p.isCloned);
  const uncloned = localProjects.filter((p) => !p.isCloned);
  const roots = localProjects.filter((p) => !p.relativePath);
  const subpaths = localProjects.filter((p) => p.relativePath);
  const uniqueWorktrees = new Set(localProjects.map((p) => p.worktree));

  console.log(`\nBreakdown:`);
  console.log(`  Cloned: ${cloned.length}`);
  console.log(`  Uncloned: ${uncloned.length}`);
  console.log(`  Root repositories: ${roots.length}`);
  console.log(`  Subpaths/folders: ${subpaths.length}`);
  console.log(`  Unique worktrees: ${uniqueWorktrees.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
