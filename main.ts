import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TFile,
} from "obsidian";
import { FirstTimeWelcomeModal } from "./FirstTimeWelcomeModal";

const OBSIDIAN_API =
	"https://7ul423cced.execute-api.us-east-2.amazonaws.com/prod/obsidian";

interface TaskRobinPluginSettings {
	hasWelcomedUser: boolean;
	emailAddress: string;
	accessToken: string;
	rootDirectory: string;
	downloadAttachments: boolean;
	forwardingEmailAlias: string;
}

const DEFAULT_SETTINGS: TaskRobinPluginSettings = {
	hasWelcomedUser: false,
	emailAddress: "",
	accessToken: "",
	rootDirectory: "Emails",
	downloadAttachments: true,
	forwardingEmailAlias: "",
};

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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
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

interface SyncResponse {
	emails: Array<{
		[key: string]: {
			[key: string]: string;
		};
	}>;
}

class SetupIntegrationModal extends Modal {
	plugin: TaskRobinPlugin;
	private sourceEmail = "";
	private forwardingEmailAlias = "";
	private isSubmitting = false;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
	}

	private isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	private isTaskRobinEmail(email: string): boolean {
		return email.toLowerCase().endsWith("@taskrobin.io");
	}

	async createIntegration(sourceEmail: string, forwardingEmailAlias: string) {
		if (this.isSubmitting) return;

		const submitButton = this.contentEl.querySelector(
			".taskrobin-submit"
		) as HTMLButtonElement;
		if (submitButton) {
			submitButton.disabled = true;
			submitButton.setText("Creating integration...");
		}
		this.isSubmitting = true;

		try {
			const response = await fetch(`${OBSIDIAN_API}/mappings`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userEmail: sourceEmail,
					emailAlias: forwardingEmailAlias + "@taskrobin.io",
				}),
			});

			const payload = await response.json();

			if (payload.status === "success") {
				// Store the access token, email, and alias in plugin settings
				this.plugin.settings.accessToken = payload.accessToken;
				this.plugin.settings.emailAddress = sourceEmail;
				this.plugin.settings.forwardingEmailAlias =
					forwardingEmailAlias;
				await this.plugin.saveSettings();

				new Notice("Integration created successfully!");
				this.close();
			} else {
				// Handle failure case
				console.error("Integration creation failed:", payload.error);
				new Notice(`Failed to create integration: ${payload.error}`);
			}
		} catch (error) {
			console.error("Failed to create integration:", error);
			new Notice(
				"Failed to create integration. Please check your network connection and try again."
			);
		} finally {
			this.isSubmitting = false;
			if (submitButton) {
				submitButton.disabled = false;
				submitButton.setText("Create integration");
			}
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Setup email sync" });

		// Explanation section
		const explanationEl = contentEl.createEl("div", {
			cls: "taskrobin-explanation",
		});
		explanationEl.createEl("p", {
			text: "TaskRobin helps you sync your emails to Obsidian through email forwarding. Here's how it works:",
		});

		const stepsList = explanationEl.createEl("ul");
		stepsList.createEl("li", {
			text: "1. Enter your email address that you'll forward emails from",
		});
		stepsList.createEl("li", {
			text: "2. Create a TaskRobin forwarding address that will receive your emails",
		});
		stepsList.createEl("li", {
			text: "3. Choose where to save your emails in Obsidian",
		});

		// Input fields section
		const inputsContainer = contentEl.createEl("div", {
			cls: "taskrobin-inputs",
		});

		// Source Email input
		const sourceEmailContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});

		sourceEmailContainer.createEl("label", {
			text: "Email address to sync emails from:",
		});
		const sourceEmailInput = sourceEmailContainer.createEl("input", {
			type: "email",
			placeholder: "your.email@example.com",
			value: this.plugin.settings.emailAddress,
		});
		const sourceEmailError = sourceEmailContainer.createEl("div", {
			cls: "taskrobin-error-message",
		});
		sourceEmailError.setAttr(
			"style",
			"color: red; display: none; font-size: 12px; margin-top: 4px;"
		);

		// Forwarding address input
		const forwardingContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		forwardingContainer.createEl("label", {
			text: "Choose your forwarding address:",
		});
		const forwardingInputWrapper = forwardingContainer.createEl("div", {
			cls: "taskrobin-forwarding-wrapper",
		});
		const forwardingInput = forwardingInputWrapper.createEl("input", {
			type: "text",
			placeholder: "obsidian",
		});
		forwardingInputWrapper.createEl("span", {
			cls: "taskrobin-domain",
			text: "@taskrobin.io",
		});
		const forwardingEmailError = forwardingContainer.createEl("div", {
			cls: "taskrobin-error-message",
		});
		forwardingEmailError.setAttr(
			"style",
			"color: red; display: none; font-size: 12px; margin-top: 4px;"
		);

		const validateInputs = () => {
			let isValid = true;
			const sourceEmail = sourceEmailInput.value.trim();
			const forwardingAlias = forwardingInput.value.trim();

			// Validate source email
			if (!sourceEmail) {
				sourceEmailError.setText("Email address is required");
				sourceEmailError.classList.add("visible");
				isValid = false;
			} else if (
				!this.isValidEmail(sourceEmail) ||
				this.isTaskRobinEmail(sourceEmail)
			) {
				sourceEmailError.setText("Please enter a valid email address.");
				sourceEmailError.classList.add("visible");
				isValid = false;
			} else {
				sourceEmailError.classList.remove("visible");
			}

			// Validate forwarding email
			if (!forwardingAlias) {
				forwardingEmailError.setText("Forwarding address is required");
				forwardingEmailError.classList.add("visible");
				isValid = false;
			} else if (!/^[a-zA-Z0-9-_]+$/.test(forwardingAlias)) {
				forwardingEmailError.setText(
					"Only letters, numbers, hyphens, and underscores are allowed"
				);
				forwardingEmailError.classList.add("visible");
				isValid = false;
			} else {
				forwardingEmailError.classList.remove("visible");
			}

			// Update confirm button state
			confirmButton.disabled =
				!isValid ||
				!sourceEmail ||
				!forwardingAlias ||
				!directoryInput.value;

			return isValid;
		};

		// Root directory input
		const directoryContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		directoryContainer.createEl("label", {
			text: "Where should emails be saved in the vault?",
		});
		const directoryInput = directoryContainer.createEl("input", {
			type: "text",
			placeholder: "Emails",
			value: this.plugin.settings.rootDirectory,
		});
		directoryContainer.createEl("div", {
			cls: "taskrobin-help-text",
			text: "Folder will be created if it doesn't exist",
		});

		// Add some helpful text
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "After setting up forwarding, emails sent to your TaskRobin address can be synced to your Obsidian vault.",
		});
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "Please note that TaskRobin is a paid service. 7-day free trial is available to all new users. Paid plan starts at $2.49/month.",
		});

		// Create a container for the buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});

		// Add confirm button
		const confirmButton = buttonContainer.createEl("button", {
			text: "Confirm settings",
			cls: "mod-cta",
		});
		confirmButton.disabled = true;

		// Add settings button
		const settingsButton = buttonContainer.createEl("button", {
			text: "Advanced settings",
		});

		// Function to check if all fields are filled
		const checkFields = () => {
			const sourceEmail = sourceEmailInput.value;
			const forwardingEmailAlias = forwardingInput.value;
			const directory = directoryInput.value;

			confirmButton.disabled =
				!sourceEmail || !forwardingEmailAlias || !directory;
		};

		// Add input listeners for validation
		sourceEmailInput.addEventListener("input", validateInputs);
		forwardingInput.addEventListener("input", validateInputs);
		directoryInput.addEventListener("input", validateInputs);

		// Add input listeners
		sourceEmailInput.addEventListener("input", checkFields);
		forwardingInput.addEventListener("input", checkFields);
		directoryInput.addEventListener("input", checkFields);

		// Handle confirm button click
		confirmButton.addEventListener("click", async () => {
			if (!validateInputs()) {
				new Notice("Please fill in all required fields correctly.");
				confirmButton.disabled = false;
				return;
			}

			// Disable button during sync
			confirmButton.disabled = true;
			confirmButton.setText("Creating...");

			const directory = directoryInput.value.replace(/^\/+|\/+$/g, "");
			try {
				await this.handleSubmit();
			} catch (error) {
				// Handle any errors that occur during submission
				console.error("Error during setup:", error);
				// Optionally show an error message to the user
				new Notice("Failed to save settings. Please try again.");
				confirmButton.disabled = false;
				confirmButton.setText("Confirm settings");
			}

			// Update settings
			this.plugin.settings.emailAddress = this.sourceEmail;
			this.plugin.settings.rootDirectory = directory || "Emails";
			await this.plugin.saveSettings();

			// Create directory if it doesn't exist
			try {
				const folderExists =
					(await this.app.vault.getAbstractFileByPath(directory)) !==
					null;
				if (!folderExists) {
					await this.app.vault.createFolder(directory);
				}
				new Notice("Settings saved successfully!");
				this.close();
			} catch (error) {
				console.error("Error creating directory:", error);
				new Notice(
					"Error creating directory. Check console for details."
				);
			}
		});

		settingsButton.addEventListener("click", () => {
			this.close();
			const setting = (this.app as any).setting;
			setting.open();
			setting.openTabById(this.plugin.manifest.id);
		});

		// Add input listeners
		sourceEmailInput.addEventListener("input", (e) => {
			this.sourceEmail = (e.target as HTMLInputElement).value.trim();
		});

		forwardingInput.addEventListener("input", (e) => {
			this.forwardingEmailAlias = (
				e.target as HTMLInputElement
			).value.trim();
		});
	}

	async handleSubmit() {
		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(this.sourceEmail)) {
			new Notice("Please enter a valid email address");
			return;
		}

		// Validate alias format (you might want to adjust these requirements)
		if (!/^[a-zA-Z0-9-_]+$/.test(this.forwardingEmailAlias)) {
			new Notice(
				"Forwarding alias can only contain letters, numbers, hyphens, and underscores"
			);
			return;
		}

		await this.createIntegration(
			this.sourceEmail,
			this.forwardingEmailAlias
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SyncEmailModal extends Modal {
	plugin: TaskRobinPlugin;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", {
			text: `Sync emails with TaskRobin`,
		});

		const helperDescription = contentEl.createEl("div", {
			cls: "taskrobin-helper-description",
		});

		const connectionStatus = helperDescription.createEl("p");
		setIcon(connectionStatus, "circle-check");
		connectionStatus.appendText(" Ready to sync emails from  "); // Add forwarding email with formatting
		const connectionForwardingEmailSpan = connectionStatus.createEl(
			"span",
			{
				cls: "mono-text-span",
			}
		);
		connectionForwardingEmailSpan.setText(
			`${this.plugin.settings.forwardingEmailAlias}@taskrobin.io`
		);

		// Create paragraph with formatted email addresses
		const emailInfoParagraph = helperDescription.createEl("p");
		setIcon(emailInfoParagraph, "send-horizontal");
		emailInfoParagraph.appendText(" Send emails from ");

		// Add source email with formatting
		const sourceEmailSpan = emailInfoParagraph.createEl("span", {
			cls: "mono-text-span",
		});
		sourceEmailSpan.setText(this.plugin.settings.emailAddress);

		emailInfoParagraph.appendText(" to ");

		// Add forwarding email with formatting
		const forwardingEmailSpan = emailInfoParagraph.createEl("span", {
			cls: "mono-text-span",
		});
		forwardingEmailSpan.setText(
			`${this.plugin.settings.forwardingEmailAlias}@taskrobin.io`
		);

		emailInfoParagraph.appendText(
			". Then click the 'Sync now' button to download email messages into your vault. "
		);

		// Add directory information
		const directoryInfo = contentEl.createEl("div", {
			cls: "taskrobin-directory-info",
		});

		// Create paragraph with formatted directory path
		const directoryParagraph = directoryInfo.createEl("p");
		setIcon(directoryParagraph, "save");
		directoryParagraph.appendText(
			" Emails will be saved in your vault at: "
		);

		// Add directory path with formatting
		const directoryPathSpan = directoryParagraph.createEl("span", {
			cls: "mono-text-span",
		});
		directoryPathSpan.setText(`/${this.plugin.settings.rootDirectory}/`);

		// Add attachment status
		directoryParagraph.appendText(
			`. Attachments will be ${
				this.plugin.settings.downloadAttachments
					? "downloaded"
					: "ignored"
			}`
		);

		// Add TaskRobin.io link
		const taskRobinInfoFooter = directoryInfo.createEl("p", {
			cls: ["taskrobin-help-text", "taskrobin-footer"],
		});
		taskRobinInfoFooter.createEl("p", {
			text: "TaskRobin integrates emails from any email provider to Obsidian, Notion, Airtable and Google Drive.",
		});
		const link = taskRobinInfoFooter.createEl("a", {
			text: "Visit TaskRobin.io for more information",
			href: "https://www.taskrobin.io",
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener noreferrer");

		// Directory status check
		try {
			const folderExists = this.app.vault.getAbstractFileByPath(
				this.plugin.settings.rootDirectory
			);

			if (!folderExists) {
				directoryInfo.createEl("p", {
					text: "Warning: Directory does not exist. It will be created when syncing.",
					cls: "directory-warning",
				});
			}
		} catch (error) {
			console.error("Error checking directory:", error);
		}

		// Create a container for the buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});

		// Add sync button
		const syncButton = buttonContainer.createEl("button", {
			text: "Sync now",
			cls: "mod-cta", // This gives it primary button styling
		});

		// Add settings button (existing code)
		const settingsButton = buttonContainer.createEl("button", {
			text: "Open settings",
		});

		// Add delete button
		const deleteButton = buttonContainer.createEl("button", {
			text: "Delete integration",
			cls: "mod-warning",
		});

		function formatEmailFolderName(
			emailId: string,
			subject: string
		): string {
			// Convert string emailId to number and remove the last 6 digits to get the standard Unix timestamp
			const timestamp = Math.floor(parseInt(emailId) / 1000000);

			// Create a Date object from the Unix timestamp
			const date = new Date(timestamp * 1000);

			// Format the date as YYYY-MM-DD
			const formattedDate = date.toISOString().split("T")[0];

			// Use default if subject is empty or only whitespace
			const rawName = `${formattedDate} ${
				subject?.trim() || "No Subject"
			}`;

			// Remove invalid file system characters: * " \ / < > : | ?
			// Also remove trailing dots or spaces which are problematic in Windows
			const safeName = rawName
				.replace(/[\*"\\\/\<\>\:\|\?]/g, "_") // Replace invalid chars with underscore
				.replace(/[. ]+$/, ""); // Remove trailing dots or spaces

			return safeName;
		}

		// Handle sync button click
		syncButton.addEventListener("click", async () => {
			try {
				// Disable button during sync
				syncButton.disabled = true;
				syncButton.setText("Syncing...");

				// Make API request
				const response = await fetch(
					`${OBSIDIAN_API}/emails/${this.plugin.settings.emailAddress}`,
					{
						method: "GET",
						headers: {
							Authorization: `Bearer ${this.plugin.settings.accessToken}`,
							"Content-Type": "application/json",
						},
					}
				);

				if (!response.ok) {
					throw new Error(
						`API request failed: ${response.statusText}`
					);
				}

				const data: SyncResponse = await response.json();

				// Process each email group
				for (const emailGroup of data.emails) {
					for (const [emailId, files] of Object.entries(emailGroup)) {
						// Find the markdown file and extract subject
						let subject = "";
						for (const [fileName, fileUrl] of Object.entries(
							files
						)) {
							if (fileName.endsWith(".md")) {
								const response = await fetch(fileUrl);
								const content = await response.text();
								const subjectMatch =
									content.match(/^Subject: (.+)$/m);
								if (subjectMatch) {
									subject = subjectMatch[1].trim();
									break;
								}
							}
						}

						// Create folder for this email with subject if available
						const folderName = formatEmailFolderName(
							emailId,
							subject
						);
						const emailFolderPath = `${this.plugin.settings.rootDirectory}/${folderName}`;
						const folderExists =
							(await this.app.vault.getAbstractFileByPath(
								emailFolderPath
							)) !== null;
						if (!folderExists) {
							await this.app.vault.createFolder(emailFolderPath);
						}

						// Download all files for this email
						const downloadPromises = Object.entries(files).map(
							async ([fileName, fileUrl]) => {
								try {
									// Save file to vault with subject prefix for markdown files
									const finalFileName =
										fileName.endsWith(".md") && subject
											? `${subject}-${fileName}`
											: fileName;
									const finalFilePath = `${emailFolderPath}/${finalFileName}`;
									const finalFilePathExists =
										(await this.app.vault.getAbstractFileByPath(
											finalFilePath
										)) !== null;
									// Only fetch files from remote if local file does not already exist
									if (!finalFilePathExists) {
										// Fetch the file
										const fileResponse = await fetch(
											fileUrl,
											{
												mode: "cors",
												credentials: "omit", // Don't send credentials for presigned URLs
											}
										);
										if (!fileResponse.ok) {
											throw new Error(
												`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`
											);
										}
										// Convert to array buffer
										const fileData =
											await fileResponse.arrayBuffer();
										await this.app.vault.createBinary(
											finalFilePath,
											fileData
										);
									}
								} catch (error) {
									console.error(
										`Error downloading file ${fileName}:`,
										error
									);
									new Notice(
										`Failed to download file: ${fileName}`
									);
								}
							}
						);

						// Wait for all downloads to complete for this email
						await Promise.all(downloadPromises);
						new Notice(
							`Sync completed! Files saved in ${emailFolderPath}`
						);
					}
				}
			} catch (error) {
				console.error("Sync error:", error);
				new Notice("Failed to sync. Check console for details.");
			} finally {
				// Re-enable button
				syncButton.disabled = false;
				syncButton.setText("Sync now");
			}
		});

		// Handle delete button click
		deleteButton.addEventListener("click", async () => {
			try {
				// Disable button during deletion
				deleteButton.disabled = true;
				deleteButton.setText("Deleting...");

				// Make DELETE API request
				const response = await fetch(`${OBSIDIAN_API}/mappings`, {
					method: "DELETE",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.plugin.settings.accessToken}`,
					},
					body: JSON.stringify({
						userEmail: this.plugin.settings.emailAddress,
						emailAlias:
							this.plugin.settings.forwardingEmailAlias +
							"@taskrobin.io",
						accessToken: this.plugin.settings.accessToken,
					}),
				});

				if (!response.ok) {
					throw new Error(
						`API request failed: ${response.statusText}`
					);
				}

				const payload = await response.json();

				if (payload.status === "success") {
					// Only clear settings if deletion was successful
					this.plugin.settings.emailAddress = "";
					this.plugin.settings.accessToken = "";
					this.plugin.settings.forwardingEmailAlias = "";
					await this.plugin.saveSettings();
				} else {
					throw new Error("Failed to delete user mapping");
				}

				new Notice("Integration successfully deleted!");
				this.close();
			} catch (error) {
				console.error("Delete error:", error);
				new Notice(
					"Failed to delete integration. Check console for details."
				);
			} finally {
				// Re-enable button
				deleteButton.disabled = false;
				deleteButton.setText("Delete integration");
			}
		});

		// Existing settings button event listener
		settingsButton.addEventListener("click", () => {
			this.close();
			const setting = (this.app as any).setting;
			setting.open();
			setting.openTabById(this.plugin.manifest.id);
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: TaskRobinPlugin;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Welcome information")
			.setDesc(
				"Show me basic information about this plugin and how to make the best out of Sync Email by TaskRobin."
			)
			.addButton((button) =>
				button
					.setButtonText("Show me")
					.setCta()
					.onClick(() => {
						new FirstTimeWelcomeModal(this.app, this.plugin).open();
					})
			);

		// Check if the required settings are empty
		if (
			!this.plugin.settings.emailAddress ||
			!this.plugin.settings.accessToken ||
			!this.plugin.settings.rootDirectory
		) {
			// Display setup button when required settings are missing
			new Setting(containerEl)
				.setName("TaskRobin setup")
				.setDesc(
					"Complete the setup process to start syncing emails to your Obsidian vault. TaskRobin helps you sync your emails to Obsidian through email forwarding. Complete the setup to get started."
				)
				.addButton((button) =>
					button
						.setButtonText("Setup TaskRobin")
						.setCta()
						.onClick(() => {
							new SetupIntegrationModal(
								this.app,
								this.plugin
							).open();
						})
				);

			return;
		}

		new Setting(containerEl)
			.setName("Your email inbox address")
			.setDesc(
				"The email address that you want to sync emails from, e.g. your-name@gmail.com"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your email inbox address")
					.setValue(this.plugin.settings.emailAddress)
					.onChange(async (value) => {
						this.plugin.settings.emailAddress = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Access token")
			.setDesc(
				"Your TaskRobin integration access token. Complete the setup process to obtain this key. DO NOT SHARE THIS."
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"Enter your TaskRobin integration access token"
					)
					.setValue(this.plugin.settings.accessToken)
					.onChange(async (value) => {
						this.plugin.settings.accessToken = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Root directory")
			.setDesc(
				"The folder where email content will be saved (folders will be created if they don't exist)"
			)
			.addText((text) =>
				text
					.setPlaceholder("Emails")
					.setValue(this.plugin.settings.rootDirectory)
					.onChange(async (value) => {
						value = value.replace(/^\/+|\/+$/g, "");
						if (!value) {
							value = "Emails";
						}
						this.plugin.settings.rootDirectory = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText("Create directory").onClick(async () => {
					try {
						const folderPath = this.plugin.settings.rootDirectory;
						const folderExists =
							(await this.app.vault.getAbstractFileByPath(
								folderPath
							)) !== null;
						if (!folderExists) {
							await this.app.vault.createFolder(folderPath);
							new Notice(`Created directory: ${folderPath}`);
						} else {
							new Notice(
								`Directory already exists: ${folderPath}`
							);
						}
					} catch (error) {
						console.error("Error creating directory:", error);
						new Notice(
							"Error creating directory. Check console for details."
						);
					}
				})
			);

		// Add new toggle for attachments
		new Setting(containerEl)
			.setName("Download attachments")
			.setDesc(
				"When enabled, email attachments will be downloaded and saved in the vault"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.downloadAttachments)
					.onChange(async (value) => {
						this.plugin.settings.downloadAttachments = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
