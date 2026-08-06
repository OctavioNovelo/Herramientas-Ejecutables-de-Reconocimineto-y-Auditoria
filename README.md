This project is a modular network auditing frontend written in Python.
Its goal is to allow users to run well-known open-source security tools without directly using commands or a terminal, by interacting
with a structured interface. This software bundles and executes locally compiled open-source tools.

The software acts as an orchestrator:

    - It collects user input through a UI.
    - Validates and sanitizes that input.
    - Detects the Operating System (Windows/Linux) and adjusts execution.
    - Executes security tools internally.
    - Captures and processes their output.
    - In later stages, the output will be analyzed using AI to provide focused and actionable insights for network auditing.

Current Scope
Implemented / In progress:

    Project structure
        - CLI-based user interface
        - Input validation layer
        - Tool execution layer (Cross-platform support)
        - Nmap Module: Internet Lento / Internet Fallando

    config:
    core:
    Core logic that **protects the system from invalid or unsafe execution**. Basically is our protect layer for inputs, flags and UI abuse.
    The core folder contains the following files:

        executor.py
        This file executes the binary files. **It handles the OS detection and network discovery logic for both Windows (ipconfig) and Linux (ip route).**

    frontend:
    This contains the UI stuff, at the moment we use the terminal as a UI, but with time we're going to add a user friendly UI.
    The frontend folder contains the following files:

        CLI.py
        Command Line Interface.

        option.py
        Handles the mapping between user selection and tool parameters.

    The frontend communicates only with 'core' and 'tools'.
    This layer does not execute tools directly.

    tools:
    This folder contains the tools that we are going to use.
    The tools folder contains the following files:

        nmap.py
        Contains the specific logic for Nmap scans (Internet Lento/Fallando).

        tools_bin
        This folder contains the binaries of the tools that we'll use, **organized by OS (Linux/Windows).**

    utils:
    This folder contains extra functions like a logger that allows to register, events, errors, executions, etc.
    The utils folder contains the following files:

        runner.py
        This script run the commands using de input provide by CLI.py

        logger.py
        This file allows to tracks executions, errors, and audit history.

        validation.py
        This file check the security.

Execution Flow
    1) User selects the option in the UI.
    2) Validated parameters are passed to the runner.py.
    3) The system detects the OS to adjust commands (like removing 'sudo' on Windows).
    4) The tool is executed internally using the local binary.
    5) Output is capture and returned.
    6) (Future) AI analyzes the output and provides insights.
    7) Results are displayed to the user.

Ethical Notice
    No one follow me in github but i think is important to declare that this software must only be used on systems you own and systems you have explicit permission to audit.

    Unauthorized network scanning is illegal.