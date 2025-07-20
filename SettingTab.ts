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
	}
}
