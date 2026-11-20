# Docker environment status — November 20, 2026

## Current result: Docker and both databases running

The user selected Full access for this chat, resolving the command runner's Docker-engine restriction. `docker info` succeeded and Docker Compose started the assignment services. Both containers are healthy. PostgreSQL 17.12 and MongoDB 8.0.38 passed all 21 direct database checks. See [the recorded results](qa-results/README.md).

Docker Desktop was updated from 4.98.0.245422 to 4.99.0.245822. The Windows installer reported **Installation succeeded**, and the application dashboard subsequently displayed **Engine running**. No restart was requested. Optional Docker account sign-in was skipped.

The original registry-key error below is historical; it is no longer blocking the application.

## Original failure

Observed error when launching Docker Desktop:

```text
Error: getting backend binary path: cannot find registry key
"SOFTWARE\\Docker Inc.\\Docker Desktop": The system cannot find the file specified.
```

The user confirmed the same error when opening Docker directly from Windows. The Docker CLI is installed, but the Linux engine named pipe is unavailable.

The local Docker Desktop application, installer, and backend all report version 4.98.0.245422 and valid Docker Inc. signatures. Opening the existing installer through computer use did not produce a targetable installation window. The automation session also receives access-denied results for WSL diagnostics and some registry reads; these do not prove that WSL itself is broken.

No Docker uninstall, factory reset, manual registry edit, or container-data deletion was performed. No project database volumes have been created by this task.

## Installation attempts and successful repair

The installed copy was invoked with the following arguments (plus `--quiet` for the background command attempt):

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop Installer.exe" install --user
```

It exited with code -5 and **Missing package flag**. The earlier suggestion to use this installed copy was insufficient: it requires the complete installation package.

The complete Windows x86_64 installer was then downloaded from Docker's official installation page. Its Docker Inc. signature was valid and its version was 4.99.0.245822. Running it in the restricted command runner exited with code -5 without a useful diagnostic. Opening it through Windows computer use exposed the installation wizard. Per-user installation with WSL 2 completed successfully, and Docker Desktop started.

## Resolved command-runner restriction

Before the permission change, the command runner received:

```text
permission denied while trying to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine
```

A request for access to the engine named pipe failed with **permission path cannot be represented losslessly**. An elevated `docker compose up -d --wait --wait-timeout 180` request was then automatically rejected because the session's approval policy has `sandbox_approval: false`.

After the user switched the chat to Full access, the command runner could manage the containers. The startup and test commands in the README have now executed successfully. No Docker daemon security settings or named-pipe access-control lists were changed.

Docker's documentation describes the per-user install mode, its `%LOCALAPPDATA%\Programs\DockerDesktop` location, and the `install --user` command: [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
