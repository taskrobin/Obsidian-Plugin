import { App, Modal, Notice } from "obsidian";
import {
	createIntegration,
	requestAuthCode,
	verifyAuthCode,
} from "../api";
import TaskRobinPlugin from "../main";
import {
	getAccessTokenForEmail,
	setAccessTokenForEmail,
} from "../syncService";
import { EmailFolderStructure, Integration } from "../types";
import {
	isTaskRobinEmail,
	isValidEmail,
	validateDirectoryPath,
} from "../utils";
import { SyncEmailModal } from "./SyncEmailModal";

type SetupStep = "email" | "code" | "details";

export class SetupIntegrationModal extends Modal {
	plugin: TaskRobinPlugin;
	private step: SetupStep = "email";
	private sourceEmail = "";
	private authCode = "";
	private verificationToken = "";
	// If the entered email already has an accessToken from a previous
	// integration, we reuse it as proof of ownership instead of making
	// the user go through email verification (OTP) again.
	private existingAccessToken = "";
	private forwardingEmailAlias = "";
	private rootDirectory = "";
	private folderStructure: EmailFolderStructure =
		EmailFolderStructure.FolderPerEmail; // Default value
	private isSubmitting = false;
	private isRequestingCode = false;
	private isVerifyingCode = false;

	constructor(app: App, plugin: TaskRobinPlugin) {
		super(app);
		this.plugin = plugin;
		this.rootDirectory = this.plugin.settings.rootDirectory;
		// Pre-fill with default email if available
		this.sourceEmail = this.plugin.settings.defaultEmailAddress || "";
	}

	async handleIntegrationCreation(
		originEmail: string,
		forwardingEmailAlias: string,
		rootDirectory: string,
		auth: { verificationToken?: string; accessToken?: string },
	) {
		if (this.isSubmitting) return;

		const submitButton = this.contentEl.querySelector(
			".taskrobin-submit",
		) as HTMLButtonElement;
		if (submitButton) {
			submitButton.disabled = true;
			submitButton.setText("Creating integration...");
		}
		this.isSubmitting = true;

		try {
			const payload = await createIntegration(
				originEmail,
				forwardingEmailAlias,
				auth,
			);

			if (payload.status === "success") {
				// Store the access token for this origin email
				await setAccessTokenForEmail(
					this.plugin.settings,
					originEmail,
					payload.accessToken,
					() => this.plugin.saveSettings(),
				);

				// Create a new integration object
				const newIntegration: Integration = {
					forwardingEmailAlias: forwardingEmailAlias,
					rootDirectory: rootDirectory,
					originEmail: originEmail,
					obsidianEmailFolderStructure: this.folderStructure,
				};

				// Add the new integration to the array
				this.plugin.settings.integrations.push(newIntegration);

				// If this is the first integration and no default email is set, save this email as default
				if (
					this.plugin.settings.integrations.length === 1 &&
					!this.plugin.settings.defaultEmailAddress
				) {
					this.plugin.settings.defaultEmailAddress = originEmail;
				}

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
				"Failed to create integration. Please check your network connection and try again.",
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
		this.renderStep();
	}

	private renderStep() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.step === "email") {
			this.renderEmailStep();
		} else if (this.step === "code") {
			this.renderCodeStep();
		} else {
			this.renderDetailsStep();
		}
	}

	private renderEmailStep() {
		const { contentEl } = this;

		contentEl.createEl("h2", {
			text: "Add new integration",
		});

		const explanationEl = contentEl.createEl("div", {
			cls: "taskrobin-explanation",
		});
		explanationEl.createEl("p", {
			text: "First, let's verify the email address you'll forward emails from. We'll send a one-time code to confirm you own this address.",
		});

		const inputsContainer = contentEl.createEl("div", {
			cls: "taskrobin-inputs",
		});

		const sourceEmailContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		sourceEmailContainer.createEl("label", {
			text: "Email address to sync emails from:",
		});

		const sourceEmailInput = sourceEmailContainer.createEl("input", {
			type: "email",
			placeholder: "your.email@example.com",
			value: this.sourceEmail,
		});

		sourceEmailContainer.createEl("div", {
			cls: "taskrobin-help-text",
			text: "You can use different email addresses for different integrations",
		});

		const sourceEmailError = sourceEmailContainer.createEl("div", {
			cls: "taskrobin-error-message",
		});
		sourceEmailError.setAttr(
			"style",
			"color: red; display: none; font-size: 12px; margin-top: 4px;",
		);

		const validateEmail = (): boolean => {
			const email = sourceEmailInput.value.trim();
			let isValid = true;

			if (!email) {
				sourceEmailError.setText("Email address is required");
				sourceEmailError.classList.add("visible");
				isValid = false;
			} else if (!isValidEmail(email) || isTaskRobinEmail(email)) {
				sourceEmailError.setText("Please enter a valid email address.");
				sourceEmailError.classList.add("visible");
				isValid = false;
			} else {
				sourceEmailError.classList.remove("visible");
			}

			nextButton.disabled = !isValid || !email;
			return isValid;
		};

		sourceEmailInput.addEventListener("input", () => {
			this.sourceEmail = sourceEmailInput.value.trim();
			validateEmail();
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const nextButton = buttonContainer.createEl("button", {
			text: "Next",
			cls: "mod-cta taskrobin-next",
		});
		nextButton.disabled = true;
		const settingsButton = buttonContainer.createEl("button", {
			text: "Advanced settings",
		});

		nextButton.addEventListener("click", async () => {
			if (this.isRequestingCode) return;
			if (!validateEmail()) {
				new Notice("Please enter a valid email address.");
				return;
			}

			// If this email already has a stored accessToken from a
			// previous integration, it's already verified - skip the
			// OTP flow entirely and go straight to the details step.
			const existingAccessToken = getAccessTokenForEmail(
				this.plugin.settings,
				this.sourceEmail,
			);
			if (existingAccessToken) {
				this.existingAccessToken = existingAccessToken;
				this.step = "details";
				this.renderStep();
				return;
			}

			this.isRequestingCode = true;
			nextButton.disabled = true;
			nextButton.setText("Sending code...");

			try {
				const payload = await requestAuthCode(this.sourceEmail);
				if (payload.status === "success") {
					new Notice(`Verification code sent to ${this.sourceEmail}`);
					this.step = "code";
					this.renderStep();
				} else {
					console.error("Failed to request auth code:", payload.error);
					sourceEmailError.setText(
						payload.error || "Failed to send verification code.",
					);
					sourceEmailError.classList.add("visible");
				}
			} catch (error) {
				console.error("Failed to request auth code:", error);
				new Notice(
					"Failed to send verification code. Please check your network connection and try again.",
				);
			} finally {
				this.isRequestingCode = false;
				nextButton.disabled = false;
				nextButton.setText("Next");
			}
		});

		settingsButton.addEventListener("click", () => {
			this.close();
			const setting = (this.app as any).setting;
			setting.open();
			setting.openTabById(this.plugin.manifest.id);
		});

		validateEmail();
	}

	private renderCodeStep() {
		const { contentEl } = this;

		contentEl.createEl("h2", {
			text: "Verify your email",
		});

		const explanationEl = contentEl.createEl("div", {
			cls: "taskrobin-explanation",
		});
		explanationEl.createEl("p", {
			text: `Enter the verification code sent to ${this.sourceEmail}.`,
		});

		const inputsContainer = contentEl.createEl("div", {
			cls: "taskrobin-inputs",
		});

		const codeContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		codeContainer.createEl("label", {
			text: "Verification code:",
		});
		const codeInput = codeContainer.createEl("input", {
			type: "text",
			placeholder: "123456",
			value: this.authCode,
		});
		const codeError = codeContainer.createEl("div", {
			cls: "taskrobin-error-message",
		});
		codeError.setAttr(
			"style",
			"color: red; display: none; font-size: 12px; margin-top: 4px;",
		);

		const resendLink = codeContainer.createEl("div", {
			cls: "taskrobin-help-text taskrobin-resend-link",
			text: "Didn't get a code? Resend",
		});
		resendLink.setAttr("style", "cursor: pointer; text-decoration: underline; margin-top: 4px;");

		const validateCode = (): boolean => {
			const code = codeInput.value.trim();
			let isValid = true;

			if (!code) {
				codeError.setText("Verification code is required");
				codeError.classList.add("visible");
				isValid = false;
			} else {
				codeError.classList.remove("visible");
			}

			verifyButton.disabled = !isValid || !code;
			return isValid;
		};

		codeInput.addEventListener("input", () => {
			this.authCode = codeInput.value.trim();
			validateCode();
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const backButton = buttonContainer.createEl("button", {
			text: "Back",
		});
		const verifyButton = buttonContainer.createEl("button", {
			text: "Verify",
			cls: "mod-cta taskrobin-verify",
		});
		verifyButton.disabled = true;

		backButton.addEventListener("click", () => {
			this.step = "email";
			this.renderStep();
		});

		resendLink.addEventListener("click", async () => {
			if (this.isRequestingCode) return;
			this.isRequestingCode = true;
			try {
				const payload = await requestAuthCode(this.sourceEmail);
				if (payload.status === "success") {
					new Notice(`Verification code resent to ${this.sourceEmail}`);
				} else {
					new Notice(
						`Failed to resend code: ${payload.error || "Unknown error"}`,
					);
				}
			} catch (error) {
				console.error("Failed to resend auth code:", error);
				new Notice(
					"Failed to resend verification code. Please try again.",
				);
			} finally {
				this.isRequestingCode = false;
			}
		});

		verifyButton.addEventListener("click", async () => {
			if (this.isVerifyingCode) return;
			if (!validateCode()) {
				new Notice("Please enter the verification code.");
				return;
			}

			this.isVerifyingCode = true;
			verifyButton.disabled = true;
			verifyButton.setText("Verifying...");

			try {
				const payload = await verifyAuthCode(
					this.sourceEmail,
					this.authCode,
				);
				if (payload.status === "success") {
					this.verificationToken = payload.verificationToken || "";
					new Notice("Email verified successfully!");
					this.step = "details";
					this.renderStep();
				} else {
					codeError.setText(
						payload.error || "Invalid verification code.",
					);
					codeError.classList.add("visible");
				}
			} catch (error) {
				console.error("Failed to verify auth code:", error);
				new Notice(
					"Failed to verify code. Please check your network connection and try again.",
				);
			} finally {
				this.isVerifyingCode = false;
				verifyButton.disabled = false;
				verifyButton.setText("Verify");
			}
		});

		validateCode();
	}

	private renderDetailsStep() {
		const { contentEl } = this;

		contentEl.createEl("h2", {
			text: "Add new integration",
		});

		// Explanation section
		const explanationEl = contentEl.createEl("div", {
			cls: "taskrobin-explanation",
		});
		explanationEl.createEl("p", {
			text: "Your email address is verified. Now set up the forwarding address and where to save emails in Obsidian.",
		});

		// Input fields section
		const inputsContainer = contentEl.createEl("div", {
			cls: "taskrobin-inputs",
		});

		// Verified source email (read-only)
		const sourceEmailContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		sourceEmailContainer.createEl("label", {
			text: "Verified email address:",
		});
		const sourceEmailInput = sourceEmailContainer.createEl("input", {
			type: "email",
			value: this.sourceEmail,
		});
		sourceEmailInput.disabled = true;

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
			"color: red; display: none; font-size: 12px; margin-top: 4px;",
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
		const directoryError = directoryContainer.createEl("div", {
			cls: "taskrobin-error-message",
		});
		directoryError.setAttr(
			"style",
			"color: red; display: none; font-size: 12px; margin-top: 4px;",
		);

		directoryContainer.createEl("div", {
			cls: "taskrobin-help-text",
			text: "Folder will be created if it doesn't exist",
		});

		// Add folder structure dropdown
		const folderStructureContainer = inputsContainer.createEl("div", {
			cls: "taskrobin-input-group",
		});
		folderStructureContainer.createEl("label", {
			text: "Email folder structure:",
		});
		const folderStructureSelect =
			folderStructureContainer.createEl("select");
		const folderPerEmailOption = folderStructureSelect.createEl("option", {
			text: "Create a sub-folder per email (default)",
			value: EmailFolderStructure.FolderPerEmail,
		});
		folderStructureSelect.createEl("option", {
			text: "Email markdown files in the base email folder, attachments in sub-folders per email",
			value: EmailFolderStructure.FlatAttachmentInFolder,
		});
		folderPerEmailOption.selected = true;
		folderStructureContainer.createEl("div", {
			cls: "taskrobin-help-text",
			text: "Choose how emails and attachments are organized in your vault",
		});

		// Add event listener for the folder structure select
		folderStructureSelect.addEventListener("change", (e) => {
			const value = (e.target as HTMLSelectElement).value;
			if (value === EmailFolderStructure.FolderPerEmail) {
				this.folderStructure = EmailFolderStructure.FolderPerEmail;
			} else if (value === EmailFolderStructure.FlatAttachmentInFolder) {
				this.folderStructure =
					EmailFolderStructure.FlatAttachmentInFolder;
			}
		});

		// Help text
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "After setting up forwarding, emails sent to your TaskRobin address can be synced to your Obsidian vault.",
		});
		contentEl.createEl("p", {
			cls: "taskrobin-help-text",
			text: "Please note that TaskRobin is a paid service. 7-day free trial is available to all new users. Paid plan starts at $4.99/month.",
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "taskrobin-button-container",
		});
		const confirmButton = buttonContainer.createEl("button", {
			text: "Confirm settings",
			cls: "mod-cta taskrobin-submit",
		});
		confirmButton.disabled = true;
		const settingsButton = buttonContainer.createEl("button", {
			text: "Advanced settings",
		});

		const validateInputs = () => {
			let isValid = true;
			const forwardingAlias = forwardingInput.value.trim();
			const directory = directoryInput.value.trim();

			// Validate forwarding email
			if (!forwardingAlias) {
				forwardingEmailError.setText("Forwarding address is required");
				forwardingEmailError.classList.add("visible");
				isValid = false;
			} else if (!/^[a-zA-Z0-9-_]+$/.test(forwardingAlias)) {
				forwardingEmailError.setText(
					"Only letters, numbers, hyphens, and underscores are allowed",
				);
				forwardingEmailError.classList.add("visible");
				isValid = false;
			} else {
				forwardingEmailError.classList.remove("visible");
			}

			// Validate directory path
			if (!directory) {
				directoryError.setText("Directory path is required");
				directoryError.classList.add("visible");
				isValid = false;
			} else {
				const validationResult = validateDirectoryPath(directory);
				if (!validationResult.isValid) {
					directoryError.setText(
						validationResult.errorMessage ||
							"Invalid directory path",
					);
					directoryError.classList.add("visible");
					isValid = false;
				} else {
					directoryError.classList.remove("visible");
				}
			}

			confirmButton.disabled = !isValid || !forwardingAlias || !directory;
			return isValid;
		};

		// Event listeners
		forwardingInput.addEventListener("input", validateInputs);
		directoryInput.addEventListener("input", validateInputs);

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

			if (!this.verificationToken && !this.existingAccessToken) {
				new Notice(
					"Your email is no longer verified. Please verify again.",
				);
				this.step = "email";
				this.renderStep();
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
				"Forwarding alias can only contain letters, numbers, hyphens, and underscores",
			);
			return;
		}

		if (!this.verificationToken && !this.existingAccessToken) {
			new Notice("Please verify your email address first.");
			return;
		}

		await this.handleIntegrationCreation(
			this.sourceEmail,
			this.forwardingEmailAlias,
			this.rootDirectory,
			this.existingAccessToken
				? { accessToken: this.existingAccessToken }
				: { verificationToken: this.verificationToken },
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
