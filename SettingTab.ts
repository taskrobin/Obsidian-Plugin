import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import TaskRobinPlugin from "./main";
import { FirstTimeWelcomeModal } from "./modals/FirstTimeWelcomeModal";
import { SetupIntegrationModal } from "./modals/SetupIntegrationModal";

export class SettingTab extends PluginSettingTab {
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
			(!this.plugin.settings.emailAddress &&
				this.plugin.settings.emailAuths.length === 0) ||
			(!this.plugin.settings.accessToken &&
				this.plugin.settings.emailAuths.length === 0) ||
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
			.setName("Default email inbox address")
			.setDesc(
				"The default email address for new integrations. You can change the origin email address when you create new integrations."
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

		// Add sync on launch toggle
		new Setting(containerEl)
			.setName("Sync emails on Obsidian launch")
			.setDesc(
				"When enabled, emails will be automatically synced when Obsidian starts"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnLaunch)
					.onChange(async (value) => {
						this.plugin.settings.syncOnLaunch = value;
						await this.plugin.saveSettings();
					})
			);

		// Email Authentication Section
		containerEl.createEl("h6", { text: "Email Authentication Info" });

		// Display all email-token pairs
		if (
			this.plugin.settings.emailAuths &&
			this.plugin.settings.emailAuths.length > 0
		) {
			const authContainer = containerEl.createDiv({
				cls: "taskrobin-auth-container",
			});

			// Create a heading for the auth pairs
			authContainer.createEl("p", {
				text: "The following email addresses have added with authentication tokens:",
				cls: "taskrobin-auth-heading",
			});

			// Create a list of email-token pairs
			const authList = authContainer.createEl("div", {
				cls: "taskrobin-auth-list",
			});

			// Add each email-token pair to the list
			for (const auth of this.plugin.settings.emailAuths) {
				const authItem = authList.createEl("div", {
					cls: "taskrobin-auth-item",
				});

				// Email address
				authItem.createEl("div", {
					text: `Email inbox: ${auth.originEmail}`,
					cls: "taskrobin-auth-email",
				});

				// Token (masked)
				const tokenDisplay = auth.accessToken
					? `${auth.accessToken.substring(
							0,
							5
					  )}...${auth.accessToken.substring(
							auth.accessToken.length - 5
					  )}`
					: "No token";

				authItem.createEl("div", {
					text: `Token: ${tokenDisplay}`,
					cls: "taskrobin-auth-token",
				});
			}
		} else {
			// Legacy access token display
			new Setting(containerEl)
				.setName("Access token (Legacy)")
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
		}
	}
}
