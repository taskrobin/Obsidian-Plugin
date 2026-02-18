import { App, Modal, Notice, Setting } from "obsidian";
import TaskRobinPlugin from "../main";
import { EmailFolderStructure, Integration } from "../types";
import { validateDirectoryPath } from "../utils";

export class EditDirectoryModal extends Modal {
	plugin: TaskRobinPlugin;
	integration: Integration;
	onSave: () => void;
	newDirectory: string;
	newFolderStructure: EmailFolderStructure | undefined;

	constructor(
		app: App,
		plugin: TaskRobinPlugin,
		integration: Integration,
		onSave: () => void,
	) {
		super(app);
		this.plugin = plugin;
		this.integration = integration;
		this.onSave = onSave;
		this.newDirectory = integration.rootDirectory;
		this.newFolderStructure = integration.obsidianEmailFolderStructure;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Edit integration settings" });

		contentEl.createEl("p", {
			text: `Change the directory and folder structure for emails from ${this.integration.forwardingEmailAlias}@taskrobin.io.`,
			cls: "taskrobin-help-text",
		});

		// Show current directory
		const currentDirSection = contentEl.createEl("div", {
			cls: "taskrobin-input-group",
		});
		currentDirSection.createEl("label", {
			text: "Current directory:",
		});
		const currentDirDisplay = currentDirSection.createEl("div", {
			cls: "mono-text-span",
		});
		currentDirDisplay.setText(`/${this.integration.rootDirectory}/`);

		// Input for new directory
		new Setting(contentEl)
			.setName("New directory")
			.setDesc("Enter the vault path where emails should be saved")
			.addText((text) => {
				text.setPlaceholder("e.g., TaskRobin/Emails")
					.setValue(this.newDirectory)
					.onChange((value) => {
						this.newDirectory = value.trim();
					});
				text.inputEl.style.width = "100%";
			});

		// Email folder structure dropdown
		new Setting(contentEl)
			.setName("Email folder structure")
			.setDesc("Choose how emails are organized in the directory")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(
						EmailFolderStructure.FolderPerEmail,
						"Folder per email (each email in its own folder)",
					)
					.addOption(
						EmailFolderStructure.FlatAttachmentInFolder,
						"Flat with attachments in folder",
					)
					.setValue(
						this.newFolderStructure ||
							EmailFolderStructure.FolderPerEmail,
					)
					.onChange((value) => {
						this.newFolderStructure = value as EmailFolderStructure;
					});
			});

		// Warning message area
		const warningEl = contentEl.createEl("div", {
			cls: "taskrobin-help-text",
		});

		// Validate directory on input change
		const validateDirectory = () => {
			// Check for illegal characters and path format
			const validationResult = validateDirectoryPath(this.newDirectory);
			if (!validationResult.isValid) {
				warningEl.setText(`⚠️ ${validationResult.errorMessage}`);
				warningEl.style.color = "var(--text-error)";
				return false;
			}

			// Check if directory exists
			const folder = this.app.vault.getAbstractFileByPath(
				this.newDirectory,
			);
			if (!folder) {
				warningEl.setText(
					"ℹ️ Directory does not exist. It will be created when syncing.",
				);
				warningEl.style.color = "var(--text-muted)";
			} else {
				warningEl.setText("✓ Directory exists");
				warningEl.style.color = "var(--text-success)";
			}
			return true;
		};

		// Initial validation
		validateDirectory();

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});

		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});

		// Cancel button handler
		cancelButton.addEventListener("click", () => {
			this.close();
		});

		// Save button handler
		saveButton.addEventListener("click", async () => {
			if (!validateDirectory()) {
				new Notice("Please enter a valid directory path");
				return;
			}

			const directoryChanged =
				this.newDirectory !== this.integration.rootDirectory;
			const folderStructureChanged =
				this.newFolderStructure !==
				this.integration.obsidianEmailFolderStructure;

			if (!directoryChanged && !folderStructureChanged) {
				new Notice("No changes made");
				this.close();
				return;
			}

			try {
				saveButton.disabled = true;
				saveButton.setText("Saving...");

				// Update the integration's directory and folder structure
				const integrationIndex =
					this.plugin.settings.integrations.findIndex(
						(i) =>
							i.forwardingEmailAlias ===
							this.integration.forwardingEmailAlias,
					);

				if (integrationIndex !== -1) {
					if (directoryChanged) {
						this.plugin.settings.integrations[
							integrationIndex
						].rootDirectory = this.newDirectory;
					}
					if (folderStructureChanged) {
						this.plugin.settings.integrations[
							integrationIndex
						].obsidianEmailFolderStructure =
							this.newFolderStructure;
					}
					await this.plugin.saveSettings();

					const changes = [];
					if (directoryChanged)
						changes.push(`directory: ${this.newDirectory}`);
					if (folderStructureChanged)
						changes.push(
							`folder structure: ${this.newFolderStructure}`,
						);
					new Notice(`Updated ${changes.join(", ")}`);
					this.onSave();
					this.close();
				} else {
					throw new Error("Integration not found");
				}
			} catch (error) {
				console.error("Error saving settings:", error);
				new Notice(
					"Failed to update settings. Check console for details.",
				);
				saveButton.disabled = false;
				saveButton.setText("Save");
			}
		});

		// Add input validation on change
		const textInput = contentEl.querySelector("input");
		if (textInput) {
			textInput.addEventListener("input", () => {
				validateDirectory();
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
