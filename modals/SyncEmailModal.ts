import { App, Modal, Notice, setIcon } from "obsidian";
import { deleteIntegration } from "../api";
import TaskRobinPlugin from "../main";
import { performEmailSync } from "../syncService";

export class SyncEmailModal extends Modal {
	plugin: TaskRobinPlugin;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Sync emails with TaskRobin` });

		const helperDescription = contentEl.createEl("div", {
			cls: "taskrobin-helper-description",
		});

		const connectionStatus = helperDescription.createEl("p");
		setIcon(connectionStatus, "circle-check");
		connectionStatus.appendText(" Ready to sync emails from  ");
		const connectionForwardingEmailSpan = connectionStatus.createEl(
			"span",
			{ cls: "mono-text-span" }
		);
		connectionForwardingEmailSpan.setText(
			`${this.plugin.settings.forwardingEmailAlias}@taskrobin.io`
		);

		// Create paragraph with formatted email addresses
		const emailInfoParagraph = helperDescription.createEl("p");
		setIcon(emailInfoParagraph, "send-horizontal");
		emailInfoParagraph.appendText(" Send emails from ");

		const sourceEmailSpan = emailInfoParagraph.createEl("span", {
			cls: "mono-text-span",
		});
		sourceEmailSpan.setText(this.plugin.settings.emailAddress);

		emailInfoParagraph.appendText(" to ");

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

		const directoryParagraph = directoryInfo.createEl("p");
		setIcon(directoryParagraph, "save");
		directoryParagraph.appendText(
			" Emails will be saved in your vault at: "
		);

		const directoryPathSpan = directoryParagraph.createEl("span", {
			cls: "mono-text-span",
		});
		directoryPathSpan.setText(`/${this.plugin.settings.rootDirectory}/`);

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

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const syncButton = buttonContainer.createEl("button", {
			text: "Sync now",
			cls: "mod-cta",
		});
		const settingsButton = buttonContainer.createEl("button", {
			text: "Open settings",
		});
		const deleteButton = buttonContainer.createEl("button", {
			text: "Delete integration",
			cls: "mod-warning",
		});

		// Handle sync button click
		syncButton.addEventListener("click", async () => {
			try {
				syncButton.disabled = true;
				syncButton.setText("Syncing...");
				await performEmailSync(this.app, this.plugin.settings);
			} catch (error) {
				// Error handling is done in performEmailSync
			} finally {
				syncButton.disabled = false;
				syncButton.setText("Sync now");
			}
		});

		// Handle delete button click
		deleteButton.addEventListener("click", async () => {
			try {
				deleteButton.disabled = true;
				deleteButton.setText("Deleting...");

				const payload = await deleteIntegration(
					this.plugin.settings.emailAddress,
					this.plugin.settings.forwardingEmailAlias,
					this.plugin.settings.accessToken
				);

				if (payload.status === "success") {
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
				deleteButton.disabled = false;
				deleteButton.setText("Delete integration");
			}
		});

		// Settings button event listener
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
