import { App, Modal, setIcon } from "obsidian";
import TaskRobinPlugin from "../main";

export class FirstTimeWelcomeModal extends Modal {
	plugin: TaskRobinPlugin;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Header with icon
		const headerDiv = contentEl.createDiv({
			cls: "taskrobin-welcome-header",
		});
		const headerIcon = headerDiv.createSpan({
			cls: "taskrobin-welcome-icon",
		});
		setIcon(headerIcon, "mail");
		headerDiv.createEl("h1", {
			text: "Welcome to Sync Email by TaskRobin",
		});

		// Main content
		const mainContent = contentEl.createDiv({
			cls: "taskrobin-welcome-content",
		});

		// Introduction
		mainContent.createEl("p", {
			text: "Thank you for installing Sync Email by TaskRobin for Obsidian! This plugin helps you maintain a searchable archive of important emails directly within your Obsidian workspace.",
		});

		// How it works section
		mainContent.createEl("h2", { text: "How TaskRobin Works" });

		const stepsList = mainContent.createEl("ol", {
			cls: "taskrobin-steps-list",
		});

		const step1 = stepsList.createEl("li");
		step1.createSpan({
			text: "Email Forwarding: ",
			cls: "taskrobin-step-highlight",
		});
		step1.appendText(
			"You forward selected emails to a special TaskRobin email address"
		);

		const step2 = stepsList.createEl("li");
		step2.createSpan({
			text: "Automatic Processing: ",
			cls: "taskrobin-step-highlight",
		});
		step2.appendText(
			"TaskRobin securely processes these emails and their attachments"
		);

		const step3 = stepsList.createEl("li");
		step3.createSpan({
			text: "Obsidian Integration: ",
			cls: "taskrobin-step-highlight",
		});
		step3.appendText(
			"The emails are converted to markdown and saved in your vault when you sync your emails"
		);

		// Getting started section
		mainContent.createEl("h2", { text: "Getting Started" });

		const gettingStartedList = mainContent.createEl("ul", {
			cls: "taskrobin-getting-started",
		});

		const ribbonItem = gettingStartedList.createEl("li");
		const ribbonIcon = ribbonItem.createSpan();
		setIcon(ribbonIcon, "mail");
		ribbonItem.appendText(
			" Click the TaskRobin icon in the left sidebar to set up your email sync"
		);

		const settingsItem = gettingStartedList.createEl("li");
		const settingsIcon = settingsItem.createSpan();
		setIcon(settingsIcon, "settings");
		settingsItem.appendText(
			" Configure advanced options in the plugin settings"
		);

		const commandItem = gettingStartedList.createEl("li");
		const commandIcon = commandItem.createSpan();
		setIcon(commandIcon, "command");
		commandItem.appendText(
			" Use the command palette to access TaskRobin features"
		);

		// Subscription info
		const subscriptionDiv = mainContent.createDiv({
			cls: "taskrobin-subscription-info",
		});
		subscriptionDiv.createEl("h3", { text: "Subscription Information" });

		const subscriptionList = subscriptionDiv.createEl("ul");
		subscriptionList.createEl("li", {
			text: "TaskRobin offers a 7-day free trial for all new users",
		});
		subscriptionList.createEl("li", {
			text: "No payment information required during the trial",
		});
		subscriptionList.createEl("li", {
			text: "Subscription plans start at $2.49/month after the trial period",
		});

		// Create a link to the website
		const linkPara = subscriptionDiv.createEl("p");
		linkPara.appendText("Visit ");
		const link = linkPara.createEl("a", {
			text: "TaskRobin.io",
			href: "https://www.taskrobin.io",
		});
		link.setAttr("target", "_blank");
		linkPara.appendText(" for pricing details and more information.");

		// Button to close and open setup
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});

		const setupButton = buttonContainer.createEl("button", {
			text: "Set Up TaskRobin",
			cls: "mod-cta",
		});

		setupButton.addEventListener("click", () => {
			this.close();
			this.plugin.showAppropriateModal();
		});

		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
		});

		closeButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
