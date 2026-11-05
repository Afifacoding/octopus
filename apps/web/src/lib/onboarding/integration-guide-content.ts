// Every instruction here mirrors the current implementation of the OCTOPUS Ghost VS Code
// extension (apps/vscode-extension), the API and this web app. Keep it in sync when they change.
// Inline formatting: `code` and **bold**.

export type GuideIconName = 'install' | 'connect' | 'project' | 'snapshot' | 'view';

export type GuideInstruction = {
  text: string;
  hint?: string;
};

export type GuideSection = {
  id: string;
  title: string;
  tone?: 'default' | 'vault' | 'warning';
  paragraphs?: string[];
  bullets?: string[];
  chips?: string[];
  troubleshooting?: Array<{ problem: string; solution: string }>;
};

export type GuideStep = {
  id: string;
  title: string;
  shortTitle: string;
  icon: GuideIconName;
  summary: string;
  instructions: GuideInstruction[];
  sections: GuideSection[];
  checklist: Array<{ id: string; label: string }>;
};

export const EXCLUDED_FOLDERS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vite',
  '.turbo',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.angular',
  '.parcel-cache',
  '.expo',
  '.docusaurus',
  '.vercel',
  '.netlify',
  '.serverless',
  '.terraform',
  '.gradle',
  '.pnpm-store',
  '.yarn/cache',
  'bower_components',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.venv',
  'venv',
  '.cache',
  '.tmp',
  '.nyc_output',
  '.octopus-storage',
];

export const EXCLUDED_FILES = [
  '*.log',
  '*.tmp',
  '*.swp',
  '*.swo',
  '*.vsix',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.pdf',
  '.DS_Store',
  'Thumbs.db',
];

export const OPTIONAL_SENSITIVE_EXCLUSIONS = ['*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa', 'id_ed25519', '.npmrc'];

export const INTEGRATION_GUIDE_STEPS: GuideStep[] = [
  {
    id: 'install-extension',
    title: 'Install OCTOPUS Extension',
    shortTitle: 'Install',
    icon: 'install',
    summary:
      'OCTOPUS Ghost is distributed as a VSIX package. It is not published on the VS Code Marketplace yet, so you install it directly from the package file.',
    instructions: [
      {
        text: 'Obtain the official OCTOPUS Ghost VSIX package (for example `octopus-ghost-0.1.1.vsix`) from your OCTOPUS team.',
        hint: 'Maintainers can build it from the repository by running `npm run package:vsix` inside `apps/vscode-extension`.',
      },
      {
        text: 'Open **VS Code** (version 1.100 or later is required).',
      },
      {
        text: 'Open the **Extensions** view from the Activity Bar, or press `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS).',
      },
      {
        text: 'Click the **⋯ Views and More Actions** menu at the top of the Extensions view and choose **Install from VSIX...**',
        hint: 'You can also run **Extensions: Install from VSIX...** from the Command Palette (`Ctrl+Shift+P`).',
      },
      {
        text: 'Select the downloaded `.vsix` file and confirm. Reload VS Code if it asks you to.',
      },
      {
        text: 'Verify the installation: **OCTOPUS Ghost** appears in your installed extensions and an **OCTOPUS** icon appears in the Activity Bar.',
        hint: 'Once the extension activates, a `OCTOPUS Save Snapshot` item also appears in the status bar.',
      },
    ],
    sections: [
      {
        id: 'install-commands',
        title: 'Commands added by the extension',
        paragraphs: ['After installation, these commands are available from the Command Palette:'],
        chips: [
          'OCTOPUS: Open Control Panel',
          'OCTOPUS: Connect Account',
          'OCTOPUS: Select Project',
          'OCTOPUS: Save Snapshot',
          'OCTOPUS: Open Web App',
        ],
      },
    ],
    checklist: [
      { id: 'install-have-vsix', label: 'I have the official OCTOPUS Ghost .vsix package' },
      { id: 'install-from-vsix', label: 'I installed it with "Install from VSIX..."' },
      { id: 'install-see-icon', label: 'I can see the OCTOPUS icon in the Activity Bar' },
    ],
  },
  {
    id: 'connect-account',
    title: 'Connect Your Account',
    shortTitle: 'Connect',
    icon: 'connect',
    summary:
      'Sign in from inside VS Code with the same email or username and password you use for this web app. There is no browser redirect or one-time code.',
    instructions: [
      {
        text: 'Open **VS Code** with the OCTOPUS Ghost extension installed.',
      },
      {
        text: 'Click the **OCTOPUS** icon in the Activity Bar to open the **Workspace** view.',
        hint: 'You can also run **OCTOPUS: Open Control Panel** from the Command Palette.',
      },
      {
        text: 'Click **Connect Account** in the Workspace view, or run **OCTOPUS: Connect Account**.',
      },
      {
        text: 'Enter your **email or username** and press Enter, then enter your **password**.',
        hint: 'Your account must have a verified email address. Unverified accounts cannot sign in.',
      },
      {
        text: 'Wait for the confirmation message **"OCTOPUS account connected successfully."**',
        hint: 'If a folder is already open, the extension continues straight into project selection (Step 3).',
      },
      {
        text: 'Verify the connection: the **Connect Account** item shows your email, and the **VS Code Integration** card on your Dashboard shows **VS Code Connected**.',
        hint: 'The extension checks in every minute. The Dashboard shows it as connected while it has been active in the last few minutes.',
      },
    ],
    sections: [
      {
        id: 'connect-security',
        title: 'How your session is stored',
        paragraphs: [
          'The extension keeps your OCTOPUS session in VS Code SecretStorage. Your password is only sent to sign in and is not stored.',
          'If your session expires, you will see **"Authentication expired. Reconnect your OCTOPUS account and try again."** Just run **Connect Account** again.',
          'Wrong credentials show **"Connection failed:"** followed by the reason from the server.',
        ],
      },
    ],
    checklist: [
      { id: 'connect-verified-account', label: 'I have an OCTOPUS account with a verified email' },
      { id: 'connect-signed-in', label: 'I signed in and saw "OCTOPUS account connected successfully."' },
      { id: 'connect-dashboard', label: 'My Dashboard shows "VS Code Connected"' },
    ],
  },
  {
    id: 'select-project',
    title: 'Select Your Project',
    shortTitle: 'Project',
    icon: 'project',
    summary:
      'Link the folder you have open in VS Code to an OCTOPUS project. OCTOPUS remembers this choice for that workspace.',
    instructions: [
      {
        text: 'In VS Code, use **File → Open Folder...** to open the project you want to capture.',
        hint: 'Multi-root workspaces are supported; each root folder name is preserved in the captured paths.',
      },
      {
        text: 'Open the **OCTOPUS** view from the Activity Bar.',
      },
      {
        text: 'Click **Select Project** (or run **OCTOPUS: Select Project**). Pick an existing project, or choose **Create New Project** and enter a name (it defaults to your folder name) and an optional description.',
        hint: 'If you have no projects yet, OCTOPUS asks **"No OCTOPUS projects found. Create one for this workspace?"** Save Snapshot also asks you to pick a project if this workspace has none yet.',
      },
      {
        text: 'Understand workspace scanning: when you save a snapshot, OCTOPUS walks every folder in your workspace and records each file that is not excluded.',
      },
      {
        text: 'Understand exclusions: generated, dependency and cache folders are skipped entirely and never read or uploaded. Expand the sections below to see exactly what is excluded.',
      },
    ],
    sections: [
      {
        id: 'project-captured',
        title: 'What OCTOPUS captures',
        paragraphs: [
          'Your source code, configuration files, documentation and assets are captured with their folder structure.',
          '`.env` files and other credential files are **included by default**, so Secret Vault can detect them. Symbolic-link folders are not followed.',
          'Default limits: up to 50,000 files, 10,000 folders and 150 MB of files before compression.',
        ],
      },
      {
        id: 'project-excluded-folders',
        title: 'Excluded folders (never captured)',
        paragraphs: ['These folders are skipped wherever they appear in your workspace, including nested ones:'],
        chips: EXCLUDED_FOLDERS,
      },
      {
        id: 'project-excluded-files',
        title: 'Excluded files and custom exclusions',
        paragraphs: [
          'These file types are always skipped:',
        ],
        chips: EXCLUDED_FILES,
        bullets: [
          'Add your own glob patterns with the `octopus.capture.excludePatterns` setting, for example `**/fixtures/**`.',
          'Turn on `octopus.capture.excludeSensitiveFiles` to also skip private keys and credential files: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519` and `.npmrc`. `.env` files are still captured.',
        ],
      },
      {
        id: 'project-vault',
        title: 'How Secret Vault handles sensitive-looking content',
        tone: 'vault',
        paragraphs: [
          'After your snapshot is uploaded, OCTOPUS scans it for sensitive-looking values such as API keys, access tokens, JWTs, database URLs, private keys, cloud credentials, OAuth client secrets, webhook secrets and values in `.env` files.',
          'Qualifying values are encrypted with AES-256-GCM and added to the project\'s **Secret Vault**. They stay masked in vault listings and in snapshot ZIP downloads, and can only be revealed after you unlock the vault with your password.',
        ],
      },
    ],
    checklist: [
      { id: 'project-folder-open', label: 'My project folder is open in VS Code' },
      { id: 'project-selected', label: 'I selected or created an OCTOPUS project' },
      { id: 'project-reviewed-exclusions', label: 'I reviewed what is captured and excluded' },
    ],
  },
  {
    id: 'save-snapshot',
    title: 'Save Your First Snapshot',
    shortTitle: 'Snapshot',
    icon: 'snapshot',
    summary:
      'One command scans your workspace, packages it into a compressed archive and uploads it to your OCTOPUS project, with live progress the whole way.',
    instructions: [
      {
        text: 'Start the snapshot: click **Save Snapshot** in the OCTOPUS view, click **OCTOPUS Save Snapshot** in the status bar, or run **OCTOPUS: Save Snapshot**.',
      },
      {
        text: 'An **OCTOPUS Snapshot Capture** notification appears. It checks your session and project first: **Preparing workspace...**, **Checking OCTOPUS session...**, **Loading OCTOPUS projects...**',
      },
      {
        text: 'Watch the scan: the notification shows **Scanning files...** with the number of files and folders found so far.',
      },
      {
        text: 'Packaging: OCTOPUS compresses the files into a temporary ZIP archive and shows **Packaging project...** with a file count and percentage.',
        hint: 'The compressed archive can be up to 30 MiB. The temporary archive is deleted from your machine afterwards.',
      },
      {
        text: 'Upload: the archive is streamed to OCTOPUS while the notification shows **Uploading snapshot...** with a percentage.',
      },
      {
        text: 'Done: you will see **"Snapshot saved successfully."** with the project and snapshot ID, plus an **Open in OCTOPUS** button that opens the snapshot in this web app.',
        hint: 'The **Last capture** item in the OCTOPUS view also updates with the project, snapshot and file count.',
      },
    ],
    sections: [
      {
        id: 'snapshot-vault-review',
        title: 'Reviewing Secret Vault detections',
        tone: 'vault',
        paragraphs: [
          'Sensitive-looking values found in your snapshot are imported into the project\'s Secret Vault automatically. To review them:',
        ],
        bullets: [
          'Open your project in this web app and click **Secret Vault** (or **Open Secret Vault** on a snapshot page).',
          'Enter your account password and click **Unlock Vault**. Access expires automatically after a while.',
          'Secrets are grouped by category and show the source file, a confidence badge and a masked value.',
          'Use **Reveal** to view a value temporarily (it hides itself after a countdown), **Copy**, **Edit** or **Delete**, and **Lock Vault** when you are done.',
        ],
      },
      {
        id: 'snapshot-troubleshooting',
        title: 'Troubleshooting',
        tone: 'warning',
        paragraphs: [
          'Every capture is logged in VS Code. Open **View → Output** and choose **OCTOPUS Ghost**, or click **Show Logs** on an error message.',
        ],
        troubleshooting: [
          {
            problem: '"OCTOPUS server error while creating snapshot. Please retry." or "Snapshot failed: ..."',
            solution:
              'The upload did not finish. Check your connection and run Save Snapshot again. The OCTOPUS Ghost output channel shows the exact error.',
          },
          {
            problem: '"Authentication expired. Reconnect your OCTOPUS account and try again."',
            solution:
              'Your session is no longer valid. Run OCTOPUS: Connect Account, sign in again, then retry. If you were never signed in, Save Snapshot asks you to connect first.',
          },
          {
            problem: '"OCTOPUS rate limit reached. Please retry shortly."',
            solution: 'Too many requests were sent in a short time. Wait a moment and try again.',
          },
          {
            problem: 'You want to stop a capture',
            solution:
              'Click Cancel on the progress notification. You will see "OCTOPUS snapshot capture cancelled."; nothing is uploaded and temporary files are removed.',
          },
          {
            problem: '"Project archive is too large", "Workspace size limit exceeded", "File limit exceeded" or "Directory limit exceeded"',
            solution:
              'Your workspace is larger than the capture limits. Exclude large generated or data folders with octopus.capture.excludePatterns, then try again.',
          },
          {
            problem: '"No files available to capture after exclusions."',
            solution: 'Every file in the open folder matched an exclusion. Check that you opened the right folder and review your custom patterns.',
          },
          {
            problem: 'Capture is slow to start',
            solution:
              'The first request to the hosted OCTOPUS server can take a moment while it wakes up. Progress keeps updating, and requests time out after 120 seconds by default (octopus.requestTimeoutMs).',
          },
        ],
      },
    ],
    checklist: [
      { id: 'snapshot-started', label: 'I started Save Snapshot from VS Code' },
      { id: 'snapshot-progress', label: 'I watched scanning, packaging and upload progress' },
      { id: 'snapshot-success', label: 'I saw "Snapshot saved successfully."' },
    ],
  },
  {
    id: 'view-snapshot',
    title: 'View Your Snapshot',
    shortTitle: 'View',
    icon: 'view',
    summary:
      'As soon as the upload succeeds, your snapshot is available in the OCTOPUS web app, ready to browse, download and analyse.',
    instructions: [
      {
        text: 'Return to the OCTOPUS web app: click **Open in OCTOPUS** on the success message, run **OCTOPUS: Open Web App**, or switch back to this tab.',
      },
      {
        text: 'Open the **Dashboard** and use **View snapshot** on the **Last Snapshot** card, or open **Projects** from the sidebar.',
        hint: 'The Dashboard refreshes automatically, so a new snapshot appears within a few seconds.',
      },
      {
        text: 'In **Projects**, find your project (use search if you have many) and click **Open**.',
      },
      {
        text: 'Under **Snapshot History**, find your snapshot and click **Details**.',
        hint: 'Its status badge shows **PENDING**, **PROCESSING**, **COMPLETED** or **FAILED**. Snapshot tools unlock once it is **COMPLETED**.',
      },
      {
        text: 'Explore the snapshot: see its capture source, creation time, archive size, file and folder counts, then use **Open Directory Tree**, **Open Blueprint** or **Download as ZIP**.',
      },
      {
        text: 'Find Secret Vault information with **Open Secret Vault** on the snapshot page, or **Secret Vault** on the project page.',
      },
    ],
    sections: [
      {
        id: 'view-tools',
        title: 'What you can do with a snapshot',
        bullets: [
          '**Directory Tree**: browse the captured folder structure and preview file contents.',
          '**Blueprint**: see the detected project type, frameworks, languages and entry points.',
          '**Download as ZIP**: download the full project structure. Secret Vault values and detected credentials are masked in the download.',
          '**Secret Vault**: review detected secrets, protected by your account password.',
        ],
      },
    ],
    checklist: [
      { id: 'view-found-project', label: 'I found my project in the web app' },
      { id: 'view-opened-snapshot', label: 'I opened my snapshot details' },
      { id: 'view-vault', label: 'I know where to find Secret Vault' },
    ],
  },
];
