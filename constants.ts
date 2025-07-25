import { TaskRobinPluginSettings } from "./types";

export const OBSIDIAN_API =
	"https://7ul423cced.execute-api.us-east-2.amazonaws.com/prod/obsidian";

export const DEFAULT_SETTINGS: TaskRobinPluginSettings = {
	hasWelcomedUser: false,
	emailAddress: "",
	accessToken: "",
	rootDirectory: "Emails",
	downloadAttachments: true,
	forwardingEmailAlias: "",
	syncOnLaunch: false,
	integrations: [],
	emailAuths: [],
};
