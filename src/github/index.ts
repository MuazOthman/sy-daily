import { Octokit } from "@octokit/rest";

type FileInput = {
  /** File path relative to basePath in the repo, e.g. "foo/bar.json" */
  path: string;
  /** File content; if binary, base64-encode it and set encoding="base64" */
  content: string;
  /** "utf-8" (default) or "base64" */
  encoding?: "utf-8" | "base64";
};

type AdditiveGitHubCommitDetails = {
  files: FileInput[]; // provide at least 2 for your use case
  /** Optional commit message override */
  message?: string;
  /** Optional branch override */
  branch?: string;
  /** Optional base path override; defaults to process.env.basePath */
  basePath?: string;
  owner: string;
  repo: string;
  token: string;
  force?: boolean;
};

export async function commitFilesToGitHub(args: AdditiveGitHubCommitDetails) {
  const octokit = new Octokit({ auth: args.token });
  const branch = args.branch || "main";
  const basePath = (args.basePath ?? "").replace(/^\/+|\/+$/g, ""); // trim slashes
  const commitMessage =
    args.message ||
    `chore: add ${args.files.length} file(s) to ${basePath || "/"} via Lambda`;

  // 1) Get ref (branch tip)
  const refResp = await octokit.git.getRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${branch}`,
  });
  const baseCommitSha = refResp.data.object.sha;

  // 2) Get base commit to find its tree
  const commitResp = await octokit.git.getCommit({
    owner: args.owner,
    repo: args.repo,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = commitResp.data.tree.sha;

  // Check if the tip commit already has the same message
  if (commitResp.data.message === commitMessage && !args.force) {
    throw new Error(
      `Commit with message "${commitMessage}" already exists at tip of branch "${branch}". Aborting to prevent duplicate commit.`
    );
  }

  // 3) Create blobs for each file
  const treeEntries: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string;
  }> = [];

  for (const f of args.files) {
    const encoding = f.encoding === "base64" ? "base64" : "utf-8";
    const blob = await octokit.git.createBlob({
      owner: args.owner,
      repo: args.repo,
      content: f.content,
      encoding,
    });

    const fullPath = [basePath, f.path].filter(Boolean).join("/");

    treeEntries.push({
      path: fullPath,
      mode: "100644",
      type: "blob",
      sha: blob.data.sha,
    });
  }

  // 4) Create a new tree from base tree + our file blobs
  const treeResp = await octokit.git.createTree({
    owner: args.owner,
    repo: args.repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // 5) Create a commit pointing to that tree
  const newCommit = await octokit.git.createCommit({
    owner: args.owner,
    repo: args.repo,
    message: commitMessage,
    tree: treeResp.data.sha,
    parents: [baseCommitSha],
  });

  // 6) Move the branch to the new commit
  await octokit.git.updateRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${branch}`,
    sha: newCommit.data.sha,
    force: false,
  });

  // 7) Return success
  const htmlUrl = `https://github.com/${args.owner}/${args.repo}/commit/${newCommit.data.sha}`;
  return {
    success: true,
    committed: args.files.map((f) =>
      [basePath, f.path].filter(Boolean).join("/")
    ),
    commit: {
      sha: newCommit.data.sha,
      url: htmlUrl,
      message: commitMessage,
      branch,
    },
  };
}
