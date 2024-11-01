import {
	App,
	MarkdownRenderer,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	moment,
} from "obsidian";
import { TaskManager } from "./TaskManager";

interface TaskInboxSettings {
	supportTaskWhenCreateFile: boolean;
	// eventType: "create" | "modify";
	inboxPath: string;
	reminderTime: string; // Format: HH:mm
	timeFormat: string; // Format: YYYYMMDDHHmmss
	targetFolder: string;
	downloadImages: boolean;
}

const DEFAULT_SETTINGS: TaskInboxSettings = {
	supportTaskWhenCreateFile: true,
	// eventType: "create",
	inboxPath: "Inbox/tasks.md",
	reminderTime: "04:00",
	timeFormat: "YYYYMMDDHHmmss",
	targetFolder: "Clippings/",
	downloadImages: false,
};

export default class TaskInboxPlugin extends Plugin {
	settings: TaskInboxSettings = DEFAULT_SETTINGS;
	private taskManager: TaskManager;

	async onload() {
		await this.loadSettings();
		this.taskManager = new TaskManager(
			this.app,
			this.settings.inboxPath,
			this.settings.timeFormat
		);

		this.app.workspace.onLayoutReady(() => {
			this.registerFileEvents();
			if (this.settings.supportTaskWhenCreateFile)
				this.setupDailyReminder();
		});

		this.addSettingTab(new TaskInboxSettingTab(this.app, this));
	}

	private registerFileEvents() {
		this.registerEvent(
			this.app.vault.on("create", async (file) => {
				if (
					file instanceof TFile &&
					file.path.startsWith(this.settings.targetFolder) &&
					file.extension === "md"
				) {
					setTimeout(async () => {
						if (this.settings.supportTaskWhenCreateFile) {
							await this.taskManager.appendTask(file, file.path);
						}
						if (this.settings.downloadImages) {
							this.downloadImages(file);
						}
					}, 1000);
				}
			})
		);
	}

	async appendTaskToInbox(targetFile: TFile, filePath: string) {
		await this.taskManager.appendTask(targetFile, filePath);
	}

	setupDailyReminder() {
		const delay = this.calculateNextCheckDelay();
		this.registerInterval(
			window.setInterval(async () => {
				await this.checkUnfinishedTasks();
			}, delay)
		);
	}

	private calculateNextCheckDelay(): number {
		const now = moment();
		const [hours, minutes] = this.settings.reminderTime
			.split(":")
			.map(Number);
		const nextCheck = moment(now)
			.hours(hours)
			.minutes(minutes)
			.seconds(0)
			.milliseconds(0);

		if (nextCheck.isSameOrBefore(now)) {
			nextCheck.add(1, "days");
		}

		return nextCheck.diff(now);
	}

	async checkUnfinishedTasks() {
		const unfinishedTasks = await this.taskManager.getUnfinishedTasks();

		if (unfinishedTasks && unfinishedTasks.length > 0) {
			const newFragment = document.createDocumentFragment();

			const div = newFragment.createEl("div");

			const markdownFileContent = `
You have ${unfinishedTasks.length} unfinished tasks in your inbox!
You can click on the link below to view your inbox.
`;

			const inboxFile = this.taskManager.getInboxFile();
			if (!inboxFile) return;

			const buttonEl = newFragment.createEl("button");
			buttonEl.setText("View Inbox");
			buttonEl.onclick = (e) => {
				this.app.workspace.getLeaf("split").openFile(inboxFile);
			};
			new Notice(newFragment, 0);

			MarkdownRenderer.render(
				this.app,
				markdownFileContent,
				div,
				inboxFile.path,
				this
			);
		}
	}

	private async downloadImages(targetFile: TFile) {
		if (!this.app.plugins.plugins["obsidian-local-images-plus"]) return;
		this.app.plugins.plugins["obsidian-local-images-plus"].processPage(
			targetFile,
			true
		);
	}

	onunload() {
		// Clean up any intervals or timeouts here if needed
	}

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

class TaskInboxSettingTab extends PluginSettingTab {
	plugin: TaskInboxPlugin;

	constructor(app: App, plugin: TaskInboxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Support task when create file")
			.setDesc(
				"When a file is created in the target folder, it will be added to your inbox"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.supportTaskWhenCreateFile)
					.onChange(async (value) => {
						this.plugin.settings.supportTaskWhenCreateFile = value;
						await this.plugin.saveSettings();

						setTimeout(() => {
							this.display();
						}, 800);
					})
			);

		if (this.plugin.settings.supportTaskWhenCreateFile) {
			this.generateTaskInbox(containerEl);
		}

		const fragment = new DocumentFragment();

		fragment.createEl(
			"div",
			{
				attr: {
					class: "task-inbox-setting",
				},
			},
			(el) => {
				el.createEl(
					"span",
					{
						text: "You need to download Local Images Plus first to use this feature	: ",
					},
					(el) => {
						el.createEl("a", {
							attr: {
								target: "_blank",
								href: "obsidian://show-plugin?id=obsidian-local-images-plus",
							},
							text: "Local Images Plus",
						});
					}
				);
			}
		);

		new Setting(containerEl)
			.setName("Download images via Local Images Plus")
			.setDesc(fragment)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.downloadImages)
					.onChange(async (value) => {
						this.plugin.settings.downloadImages = value;
						await this.plugin.saveSettings();
					})
			);
	}

	generateTaskInbox(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Set target folder")
			.setDesc(
				"When file is created in this folder, it will be added to your inbox"
			)
			.addText((text) =>
				text
					.setPlaceholder("Clippings/")
					.setValue(this.plugin.settings.targetFolder)
					.onChange(async (value) => {
						this.plugin.settings.targetFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Inbox file path")
			.setDesc("Path to the file where new tasks will be added")
			.addText((text) =>
				text
					.setPlaceholder("Inbox/tasks.md")
					.setValue(this.plugin.settings.inboxPath)
					.onChange(async (value) => {
						this.plugin.settings.inboxPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Reminder time")
			.setDesc(
				"Time to check for unfinished tasks (24-hour format, e.g., 04:00)"
			)
			.addText((text) =>
				text
					.setPlaceholder("04:00")
					.setValue(this.plugin.settings.reminderTime)
					.onChange(async (value) => {
						if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
							this.plugin.settings.reminderTime = value;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl).setName("Time format").addText((text) =>
			text.setValue("YYYYMMDDHHmmss").onChange(async (value) => {
				this.plugin.settings.timeFormat = value;
				await this.plugin.saveSettings();
			})
		);
	}
}
