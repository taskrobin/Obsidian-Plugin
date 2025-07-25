import { App, Modal, Notice, setIcon } from "obsidian";
import { deleteIntegration } from "../api";
import TaskRobinPlugin from "../main";
import { getAccessTokenForEmail, performEmailSync } from "../syncService";
import { Integration } from "../types";
import { SetupIntegrationModal } from "./SetupIntegrationModal";

export class SyncEmailModal extends Modal {
	plugin: TaskRobinPlugin;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
	}

	/**
	 * Creates a card for a single integration
	 */
	private createIntegrationCard(
		integration: Integration,
		container: HTMLElement
	) {
		const card = container.createEl("div", {
			cls: "taskrobin-integration-card",
		});

		// Card header with forwarding alias info
		const cardHeader = card.createEl("div", {
			cls: "taskrobin-card-header",
		});

		const forwardingAliasTitle = cardHeader.createEl("h3");
		forwardingAliasTitle.setText(
			`${integration.forwardingEmailAlias}@taskrobin.io`
		);

		// Card content with forwarding address and directory
		const cardContent = card.createEl("div", {
			cls: "taskrobin-card-content",
		});

		// Show the origin email for this integration
		const originEmailInfo = cardContent.createEl("div", {
			cls: "taskrobin-card-info-row",
		});
		setIcon(originEmailInfo, "mail");
		originEmailInfo.appendText(" From: ");
		const originEmailSpan = originEmailInfo.createEl("span", {
			cls: "mono-text-span",
		});
		originEmailSpan.setText(
			integration.originEmail || this.plugin.settings.emailAddress
		);

		// Directory info
		const directoryInfo = cardContent.createEl("div", {
			cls: "taskrobin-card-info-row",
		});
		setIcon(directoryInfo, "folder");
		directoryInfo.appendText(" Saved to vault location: ");
		const directoryPathSpan = directoryInfo.createEl("span", {
			cls: "mono-text-span",
		});
		directoryPathSpan.setText(`/${integration.rootDirectory}/`);

		// Check if directory exists
		try {
			const folderExists = this.app.vault.getAbstractFileByPath(
				integration.rootDirectory
			);
			if (!folderExists) {
				cardContent.createEl("div", {
					text: "Warning: Directory does not exist. It will be created when syncing.",
					cls: "directory-warning taskrobin-card-info-row",
				});
			}
		} catch (error) {
			console.error("Error checking directory:", error);
		}

		// Card actions
		const cardActions = card.createEl("div", {
			cls: "taskrobin-card-actions",
		});

		// Sync button
		const syncButton = cardActions.createEl("button", {
			text: "Sync now",
			cls: "mod-cta",
		});

		// Delete button
		const deleteButton = cardActions.createEl("button", {
			text: "Delete",
			cls: "mod-warning",
		});

		// Handle sync button click
		syncButton.addEventListener("click", async () => {
			try {
				syncButton.disabled = true;
				syncButton.setText("Syncing...");
				await performEmailSync(
					this.app,
					this.plugin.settings,
					integration
				);
				// Use integration-specific originEmail if available, otherwise fall back to global emailAddress
				const emailToUse =
					integration.originEmail ||
					this.plugin.settings.emailAddress;
				new Notice(
					`Sync completed for ${emailToUse} (${integration.forwardingEmailAlias})`
				);
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

				// Use integration-specific originEmail if available, otherwise fall back to global emailAddress
				const emailToUse =
					integration.originEmail ||
					this.plugin.settings.emailAddress;

				// Get the access token for this email address
				const accessToken = getAccessTokenForEmail(
					this.plugin.settings,
					emailToUse
				);

				const payload = await deleteIntegration(
					emailToUse,
					integration.forwardingEmailAlias,
					accessToken
				);

				if (payload.status === "success") {
					// Remove this integration from the array
					this.plugin.settings.integrations =
						this.plugin.settings.integrations.filter(
							(i) =>
								i.forwardingEmailAlias !==
								integration.forwardingEmailAlias
						);
					await this.plugin.saveSettings();

					// Refresh the modal
					this.onOpen();
				} else {
					throw new Error("Failed to delete integration");
				}

				new Notice("Integration successfully deleted!");
			} catch (error) {
				console.error("Delete error:", error);
				new Notice(
					"Failed to delete integration. Check console for details."
				);
			} finally {
				deleteButton.disabled = false;
				deleteButton.setText("Delete");
			}
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Sync emails with TaskRobin` });

		// Show instructions at the top
		contentEl.createEl("p", {
			text: "Send emails from your email inbox to the TaskRobin forwarding addresses below, then sync these emails to the respective Obsidian vault folders.",
		});

		// Container for integration cards
		const integrationsContainer = contentEl.createEl("div", {
			cls: "taskrobin-integrations-container",
		});

		// Create cards for each integration
		if (this.plugin.settings.integrations.length > 0) {
			for (const integration of this.plugin.settings.integrations) {
				this.createIntegrationCard(integration, integrationsContainer);
			}
		}
		// Legacy support
		else if (
			this.plugin.settings.emailAddress &&
			this.plugin.settings.forwardingEmailAlias
		) {
			// Create a temporary integration object from legacy settings
			const legacyIntegration: Integration = {
				forwardingEmailAlias: this.plugin.settings.forwardingEmailAlias,
				rootDirectory: this.plugin.settings.rootDirectory,
				originEmail: this.plugin.settings.emailAddress,
			};
			this.createIntegrationCard(
				legacyIntegration,
				integrationsContainer
			);
		}

		// Add TaskRobin.io link
		const taskRobinInfoFooter = contentEl.createEl("div", {
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

		// Add integration button
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const addIntegrationButton = buttonContainer.createEl("button", {
			text: "Add integration",
			cls: "mod-cta",
		});
		const settingsButton = buttonContainer.createEl("button", {
			text: "Open settings",
		});

		// Handle add integration button click
		addIntegrationButton.addEventListener("click", () => {
			this.close();
			new SetupIntegrationModal(this.app, this.plugin).open();
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
