import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./constants";
import { FirstTimeWelcomeModal } from "./modals/FirstTimeWelcomeModal";
import { SetupIntegrationModal } from "./modals/SetupIntegrationModal";
import { SyncEmailModal } from "./modals/SyncEmailModal";
import { SettingTab } from "./SettingTab";
import { performEmailSync } from "./syncService";
import { TaskRobinPluginSettings } from "./types";

export default class TaskRobinPlugin extends Plugin {
	settings: TaskRobinPluginSettings;

	async showAppropriateModal() {
		if (!this.settings.emailAddress || !this.settings.accessToken) {
			new SetupIntegrationModal(this.app, this).open();
		} else {
			new SyncEmailModal(this.app, this).open();
		}
	}

	async onload() {
		await this.loadSettings();
		if (!this.settings.hasWelcomedUser) {
			// User onboarding
			new FirstTimeWelcomeModal(this.app, this).open();
			await this.createWelcomeNote();
			this.settings.hasWelcomedUser = true;
			await this.saveSettings();
		}

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"mail",
			"TaskRobin",
			(evt: MouseEvent) => {
				this.showAppropriateModal();
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		this.addCommand({
			id: "open-modal",
			name: "Open TaskRobin window",
			callback: () => {
				this.showAppropriateModal();
			},
		});

		this.addCommand({
			id: "create-readme",
			name: "Create a readme note about this plugin",
			callback: () => {
				this.createWelcomeNote();
			},
		});

		this.addCommand({
			id: "sync-emails",
			name: "Sync emails now",
			callback: async () => {
				if (!this.settings.emailAddress || !this.settings.accessToken) {
					new SetupIntegrationModal(this.app, this).open();
					return;
				}
				try {
					await performEmailSync(this.app, this.settings);
				} catch (error) {
					console.error("Command sync failed:", error);
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

		// Sync on launch if enabled
		if (
			this.settings.syncOnLaunch &&
			this.settings.emailAddress &&
			this.settings.accessToken
		) {
			setTimeout(() => {
				performEmailSync(this.app, this.settings).catch((error) => {
					console.error("Launch sync failed:", error);
				});
			}, 2000);
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createWelcomeNote(): Promise<void> {
		const welcomeNotePath: string = "Getting started with Sync Emails.md";
		// Check if welcome note already exists
		const existingFile =
			this.app.vault.getAbstractFileByPath(welcomeNotePath);
		if (existingFile instanceof TFile) {
			console.log("Welcome note already exists");
			return;
		}

		// Create welcome note content
		const welcomeContent = `Welcome and thank you for installing Sync Emails by TaskRobin for Obsidian! This plugin helps you maintain a searchable archive of important emails directly within your Obsidian vault.

## How TaskRobin Works

TaskRobin creates a seamless bridge between your email inbox and Obsidian:

1. **Email Forwarding**: You forward selected emails from your email inbox to a TaskRobin forwarding email address that you choose
2. **Automatic Processing**: TaskRobin securely processes these emails and their attachments, the emails are converted to markdown files
3. **Obsidian Integration**: Hit the "Sync now" button to download your forwarded emails into your Obsidian vault

## Setup Guide

### 1. Configure the Plugin

- Click the TaskRobin icon in the Obsidian ribbon (envelope icon)
- Enter your email address (the one you'll forward emails from)
- Create a unique forwarding address (e.g., \`yourname@taskrobin.io\`)
- Choose where emails should be saved in your vault

### 2. Send Emails to the Forwarding Address

To save emails to your Obsidian, send emails from your registered email address to the TaskRobin forwarding address from step 1.

You can simply send, forward, CC or BCC emails one by one to your TaskRobin forward address, or setup auto forwarding with your email provider - [[#Set Up Email Auto Forwarding]]

### 3. Sync Your Emails

- Click the TaskRobin icon in the Obsidian ribbon
- Select "Sync now" to download your emails
- Emails will be saved as markdown files in your designated folder

## File Organization

Emails are saved with the following structure:

\`\`\`
Your-Vault/
└── Emails/ # Default directory (configurable)
	├── YYYY-MM-DD-{email subject line}/ # Date-based folders
	│   ├── email.md # Email content
	│   ├── attachment1.pdf # Email attachments
	│   └── attachment2.html # Email attachments
	└── ...
\`\`\`

## Subscription Information

- TaskRobin offers a 7-day free trial for all new users
- No payment information required during the trial to access all features
- Subscription plans start at $2.49/month after the trial period
- Visit [TaskRobin.io](https://www.taskrobin.io) for pricing details

## Need Help?

- Visit [TaskRobin.io](https://www.taskrobin.io) for more information
- Contact us through [Live chat support](https://app.taskrobin.io)

Thank you for choosing TaskRobin! We hope this plugin enhances your Obsidian workflow.

## Set Up Email Auto Forwarding

Depending on your email provider, set up forwarding for emails you want to save:

**Gmail**:
- Open Gmail Settings > Forwarding and POP/IMAP
- Click "Add a forwarding address" and enter your TaskRobin address
- Choose to forward selected emails or set up a filter

**Outlook**:
- Go to Settings > Mail > Forwarding
- Enter your TaskRobin forwarding address
- Choose whether to keep copies of forwarded messages

**Apple Mail**:
- Go to Mail > Preferences > Rules
- Create a new rule to forward specific emails to your TaskRobin address

`;

		// Create the welcome note
		try {
			await this.app.vault.create(welcomeNotePath, welcomeContent);
			console.log("Welcome note created successfully");

			// Open the welcome note
			const file = this.app.vault.getAbstractFileByPath(welcomeNotePath);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(file);
			}
		} catch (error) {
			console.error("Error creating welcome note:", error);
		}
	}
}
