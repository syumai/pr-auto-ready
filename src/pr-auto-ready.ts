#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execAsync = async (command: string): Promise<{ stdout: string }> => {
  if ("Deno" in globalThis) {
    // Deno environment
    const parts = command.split(" ");
    const cmd = parts[0] ?? "";
    const args = parts.slice(1);

    // @ts-ignore
    const denoCommand = new Deno.Command(cmd, { args });
    const { code, stdout, stderr } = await denoCommand.output();

    if (code !== 0) {
      const errorMessage = new TextDecoder().decode(stderr);
      throw new Error(errorMessage);
    }

    return { stdout: new TextDecoder().decode(stdout) };
  }
  // Node.js environment
  return await promisify(exec)(command);
};

interface ParsedArgs {
  prNumber: string | undefined;
  repo: string | undefined;
  interval: number;
  help: boolean;
}

interface PRInfo {
  title: string;
  state: string;
}

interface Check {
  name: string;
  state: string;
}

function showUsage(): never {
  console.log(`Usage: pr-auto-ready [PR_NUMBER] [REPO] [OPTIONS]

Arguments:
  PR_NUMBER    The pull request number to monitor (optional, auto-detected from branch)
  REPO         Repository in format 'owner/repo' (optional, auto-detected if in git repo)

Options:
  --interval N    Check interval in seconds (default: 60)
  --help, -h      Show this help message

Examples:
  pr-auto-ready                                         # Auto-detect PR and repo
  pr-auto-ready 4696                                    # Explicit PR, auto-detect repo
  pr-auto-ready 4696 owner/repo                        # Explicit PR and repo
  pr-auto-ready --interval 30                          # Auto-detect PR, custom interval`);
  process.exit(1);
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    prNumber: undefined,
    repo: undefined,
    interval: 60,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      break;
    }
    if (arg === "--interval") {
      if (i + 1 >= args.length) {
        console.error("Error: --interval requires a value");
        showUsage();
      }
      const nextArg = args[i + 1];
      if (!nextArg) {
        console.error("Error: --interval requires a value");
        showUsage();
      }
      const intervalValue = parseInt(nextArg, 10);
      if (isNaN(intervalValue) || intervalValue <= 0) {
        console.error("Error: Interval must be a positive integer");
        process.exit(1);
      }
      result.interval = intervalValue;
      i += 2;
      continue;
    }
    if (!result.prNumber) {
      result.prNumber = arg;
    } else if (result.repo === undefined) {
      result.repo = arg;
    } else {
      console.error("Error: Too many arguments");
      showUsage();
    }
    i++;
  }

  return result;
}

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Command failed: ${command}\nError: ${(error as Error).message}`
    );
  }
}

async function autoDetectRepo(): Promise<string> {
  try {
    const output = await runCommand(
      "gh repo view --json nameWithOwner -q .nameWithOwner"
    );
    return output;
  } catch (error) {
    throw new Error(
      "Could not auto-detect repository. Please specify repository or run from a git directory."
    );
  }
}

async function autoDetectPRNumber(): Promise<string> {
  try {
    const prNumber = await runCommand(
      "gh pr view --json number -q .number"
    );

    if (!prNumber) {
      throw new Error("No PR associated with current branch");
    }

    return prNumber;
  } catch (error) {
    throw new Error("Could not auto-detect PR number. Please specify PR number explicitly or ensure you are on a branch with an associated PR.");
  }
}

async function validatePR(prNumber: string, repo: string): Promise<PRInfo> {
  try {
    const output = await runCommand(
      `gh pr view ${prNumber} --repo ${repo} --json title,state`
    );
    const prInfo = JSON.parse(output) as PRInfo;
    if (prInfo.state !== "OPEN") {
      throw new Error(
        `PR #${prNumber} is not open (current state: ${prInfo.state})`
      );
    }
    return prInfo;
  } catch (error) {
    if ((error as Error).message.includes("Command failed")) {
      throw new Error(`Could not find PR #${prNumber} in repository ${repo}`);
    }
    throw error;
  }
}

async function getPRChecks(prNumber: string, repo: string): Promise<Check[]> {
  try {
    const output = await runCommand(
      `gh pr checks ${prNumber} --repo ${repo} --json state,name`
    );
    return JSON.parse(output) as Check[];
  } catch (error) {
    throw new Error(`Failed to get PR checks: ${error}`);
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function markPRReady(prNumber: string, repo: string): Promise<void> {
  try {
    await runCommand(`gh pr ready ${prNumber} --repo ${repo}`);
  } catch (error) {
    throw new Error(`Failed to mark PR as ready for review: ${error}`);
  }
}

function formatDate(): string {
  return new Date().toISOString().replace("T", " ").split(".")[0]!;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsedArgs = parseArgs(args);

  if (parsedArgs.help) {
    showUsage();
  }

  let prNumber: string;
  if (!parsedArgs.prNumber) {
    console.log("No PR number specified, attempting to auto-detect...");
    try {
      prNumber = await autoDetectPRNumber();
      console.log(`Auto-detected PR number: ${prNumber}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      showUsage();
    }
  } else {
    prNumber = parsedArgs.prNumber;
  }

  if (!/^\d+$/.test(prNumber)) {
    console.error("Error: PR number must be a positive integer");
    process.exit(1);
  }

  let repo: string;
  if (parsedArgs.repo === undefined) {
    console.log("No repository specified, attempting to auto-detect...");
    try {
      repo = await autoDetectRepo();
      console.log(`Auto-detected repository: ${repo}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      showUsage();
    }
  } else {
    repo = parsedArgs.repo;
  }

  console.log(`Validating PR #${prNumber} in repository ${repo}...`);
  try {
    const prInfo = await validatePR(prNumber, repo);
    console.log(`✅ Found PR #${prNumber}: ${prInfo.title}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }

  console.log(
    `Starting monitoring of PR #${prNumber} in ${repo}...`
  );
  console.log(
    `Checking every ${parsedArgs.interval} seconds for GitHub Actions status...`
  );

  while (true) {
    console.log(""); // Empty line before each check
    console.log(`${formatDate()}: Checking PR status...`);
    try {
      const checks = await getPRChecks(prNumber, repo);
      const pendingChecks = checks.filter((check) =>
        ["IN_PROGRESS", "QUEUED", "PENDING"].includes(check.state)
      );
      const failedChecks = checks.filter((check) =>
        ["FAILURE", "CANCELLED", "TIMED_OUT"].includes(check.state)
      );

      if (failedChecks.length > 0) {
        console.log("❌ Failed checks detected:");
        failedChecks.forEach((check) => console.log(check.name));
        console.log("Waiting for checks to be fixed...");
      } else if (pendingChecks.length > 0) {
        console.log("⏳ Checks still running:");
        pendingChecks.forEach((check) => console.log(check.name));
      } else {
        console.log("✅ All GitHub Actions have passed!");
        console.log(
          `Marking PR #${prNumber} as ready for review...`
        );
        try {
          await markPRReady(prNumber, repo);
          console.log(
            `🎉 PR #${prNumber} has been marked as ready for review!`
          );
          process.exit(0);
        } catch (error) {
          console.error(`❌ ${(error as Error).message}`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }

    console.log(`Waiting ${parsedArgs.interval} seconds before next check...`);
    await sleep(parsedArgs.interval);
  }
}

// Execute main function directly
main().catch((error) => {
  console.error(`Unexpected error: ${(error as Error).message}`);
  process.exit(1);
});
