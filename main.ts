import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

const OBSIDIAN_API =
	"https://7ul423cced.execute-api.us-east-2.amazonaws.com/prod/obsidian";

interface TaskRobinPluginSettings {
	emailAddress: string;
	accessToken: string;
	rootDirectory: string;
	downloadAttachments: boolean;
	forwardingEmailAlias: string;
}

const DEFAULT_SETTINGS: TaskRobinPluginSettings = {
	emailAddress: "",
	accessToken: "",
	rootDirectory: "Emails",
	downloadAttachments: true,
	forwardingEmailAlias: "",
};

export default class TaskRobinPlugin extends Plugin {
	settings: TaskRobinPluginSettings;

	showAppropriateModal() {
		if (!this.settings.emailAddress || !this.settings.accessToken) {
			new SetupIntegrationModal(this.app, this).open();
		} else {
			new SyncEmailModal(this.app, this).open();
		}
	}

	async onload() {
		await this.loadSettings();

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

		// Create paragraph with formatted email addresses
		const emailInfoParagraph = helperDescription.createEl("p");
		emailInfoParagraph.appendText("Download emails sent from ");

		// Add source email with formatting
		const sourceEmailSpan = emailInfoParagraph.createEl("span", {
			cls: "taskrobin-email-address",
		});
		sourceEmailSpan.setText(this.plugin.settings.emailAddress);
		sourceEmailSpan.setAttr(
			"style",
			"font-family: monospace; background-color: var(--background-secondary); padding: 0 4px; border-radius: 4px;"
		);

		emailInfoParagraph.appendText(" to ");

		// Add forwarding email with formatting
		const forwardingEmailSpan = emailInfoParagraph.createEl("span", {
			cls: "taskrobin-email-address",
		});
		forwardingEmailSpan.setText(
			`${this.plugin.settings.forwardingEmailAlias}@taskrobin.io`
		);
		forwardingEmailSpan.setAttr(
			"style",
			"font-family: monospace; background-color: var(--background-secondary); padding: 0 4px; border-radius: 4px;"
		);

		// Add directory information
		const directoryInfo = contentEl.createEl("div", {
			cls: "taskrobin-directory-info",
		});

		// Create paragraph with formatted directory path
		const directoryParagraph = directoryInfo.createEl("p");
		directoryParagraph.appendText("Emails will be saved in your vault: ");

		// Add directory path with formatting
		const directoryPathSpan = directoryParagraph.createEl("span", {
			cls: "taskrobin-directory-path",
		});
		directoryPathSpan.setText(`/${this.plugin.settings.rootDirectory}/`);
		directoryPathSpan.setAttr(
			"style",
			"font-family: monospace; background-color: var(--background-secondary); padding: 0 4px; border-radius: 4px;"
		);

		// Add attachment status
		directoryInfo.createEl("p", {
			text: `Attachments will be ${
				this.plugin.settings.downloadAttachments
					? "downloaded"
					: "ignored"
			}`,
			cls: "attachment-status",
		});

		// Add TaskRobin.io link
		const taskRobinLink = directoryInfo.createEl("p", {
			cls: "taskrobin-link",
		});
		const link = taskRobinLink.createEl("a", {
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

			// Combine date and subject
			return `${formattedDate} ${subject}`;
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
									// Fetch the file
									const fileResponse = await fetch(fileUrl, {
										mode: "cors",
										credentials: "omit", // Don't send credentials for presigned URLs
									});
									if (!fileResponse.ok) {
										throw new Error(
											`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`
										);
									}

									// Convert to array buffer
									const fileData =
										await fileResponse.arrayBuffer();

									// Save file to vault with subject prefix for markdown files
									const finalFileName =
										fileName.endsWith(".md") && subject
											? `${subject}-${fileName}`
											: fileName;
									await this.app.vault.createBinary(
										`${emailFolderPath}/${finalFileName}`,
										fileData
									);
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
			.setDesc("Your TaskRobin integration access token")
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
