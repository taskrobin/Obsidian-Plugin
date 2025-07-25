import { App, Modal, Notice } from "obsidian";
import { createIntegration } from "../api";
import TaskRobinPlugin from "../main";
import { Integration } from "../types";
import { isTaskRobinEmail, isValidEmail } from "../utils";
import { SyncEmailModal } from "./SyncEmailModal";

export class SetupIntegrationModal extends Modal {
	plugin: TaskRobinPlugin;
	private sourceEmail = "";
	private forwardingEmailAlias = "";
	private rootDirectory = "";
	private isSubmitting = false;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
		this.rootDirectory = this.plugin.settings.rootDirectory;
	}

	async handleIntegrationCreation(
		sourceEmail: string,
		forwardingEmailAlias: string,
		rootDirectory: string
	) {
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
			const payload = await createIntegration(
				sourceEmail,
				forwardingEmailAlias
			);

			if (payload.status === "success") {
				// Set the access token if it's not already set
				if (!this.plugin.settings.accessToken) {
					this.plugin.settings.accessToken = payload.accessToken;
				}

				// Create a new integration object
				const newIntegration: Integration = {
					forwardingEmailAlias: forwardingEmailAlias,
					rootDirectory: rootDirectory,
				};

				// Add the new integration to the array
				this.plugin.settings.integrations.push(newIntegration);

				// For backward compatibility, also set the legacy fields
				this.plugin.settings.emailAddress = sourceEmail;
				this.plugin.settings.forwardingEmailAlias =
					forwardingEmailAlias;

				await this.plugin.saveSettings();

				new Notice("Integration created successfully!");
				this.close();

				// Open the SyncEmailModal automatically after successful integration
				new SyncEmailModal(this.app, this.plugin).open();
			} else {
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

		contentEl.createEl("h2", {
			text: "Add new integration",
		});

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

		// If we already have an email address set up, show it as disabled
		const hasExistingEmail =
			this.plugin.settings.emailAddress &&
			this.plugin.settings.integrations.length > 0;
		const sourceEmailInput = sourceEmailContainer.createEl("input", {
			type: "email",
			placeholder: "your.email@example.com",
			value: hasExistingEmail
				? this.plugin.settings.emailAddress
				: this.sourceEmail,
		});

		// Disable the email input if we already have integrations
		if (hasExistingEmail) {
			sourceEmailInput.disabled = true;
			sourceEmailContainer.createEl("div", {
				cls: "taskrobin-help-text",
				text: "All integrations share the same email address",
			});
			// Set the source email to the existing one
			this.sourceEmail = this.plugin.settings.emailAddress;
		}

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
			value: this.rootDirectory,
		});
		directoryContainer.createEl("div", {
			cls: "taskrobin-help-text",
			text: "Folder will be created if it doesn't exist",
		});

		// Help text
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "After setting up forwarding, emails sent to your TaskRobin address can be synced to your Obsidian vault.",
		});
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "Please note that TaskRobin is a paid service. 7-day free trial is available to all new users. Paid plan starts at $2.49/month.",
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const confirmButton = buttonContainer.createEl("button", {
			text: "Confirm settings",
			cls: "mod-cta",
		});
		confirmButton.disabled = true;
		const settingsButton = buttonContainer.createEl("button", {
			text: "Advanced settings",
		});

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
				!isValidEmail(sourceEmail) ||
				isTaskRobinEmail(sourceEmail)
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

			confirmButton.disabled =
				!isValid ||
				!sourceEmail ||
				!forwardingAlias ||
				!directoryInput.value;
			return isValid;
		};

		// Event listeners
		sourceEmailInput.addEventListener("input", validateInputs);
		forwardingInput.addEventListener("input", validateInputs);
		directoryInput.addEventListener("input", validateInputs);

		sourceEmailInput.addEventListener("input", (e) => {
			this.sourceEmail = (e.target as HTMLInputElement).value.trim();
		});

		forwardingInput.addEventListener("input", (e) => {
			this.forwardingEmailAlias = (
				e.target as HTMLInputElement
			).value.trim();
		});

		directoryInput.addEventListener("input", (e) => {
			this.rootDirectory = (e.target as HTMLInputElement).value.trim();
		});

		confirmButton.addEventListener("click", async () => {
			if (!validateInputs()) {
				new Notice("Please fill in all required fields correctly.");
				return;
			}

			confirmButton.disabled = true;
			confirmButton.setText("Creating...");

			const directory = directoryInput.value.replace(/^\/+|\/+$/g, "");
			this.rootDirectory = directory || "Emails";

			try {
				await this.handleSubmit();

				// Folder creation is now handled in handleIntegrationCreation
				const folderExists =
					(await this.app.vault.getAbstractFileByPath(directory)) !==
					null;
				if (!folderExists) {
					await this.app.vault.createFolder(directory);
				}
			} catch (error) {
				console.error("Error during setup:", error);
				new Notice("Failed to save settings. Please try again.");
				confirmButton.disabled = false;
				confirmButton.setText("Confirm settings");
			}
		});

		settingsButton.addEventListener("click", () => {
			this.close();
			const setting = (this.app as any).setting;
			setting.open();
			setting.openTabById(this.plugin.manifest.id);
		});
	}

	async handleSubmit() {
		if (!isValidEmail(this.sourceEmail)) {
			new Notice("Please enter a valid email address");
			return;
		}

		if (!/^[a-zA-Z0-9-_]+$/.test(this.forwardingEmailAlias)) {
			new Notice(
				"Forwarding alias can only contain letters, numbers, hyphens, and underscores"
			);
			return;
		}

		await this.handleIntegrationCreation(
			this.sourceEmail,
			this.forwardingEmailAlias,
			this.rootDirectory
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
