import { Uri, workspace } from "coc.nvim";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import PicGo from "picgo";
import { IImgInfo, IPlugin } from "picgo/dist/src/utils/interfaces";
import { promisify } from "util";
import { TextEdit } from "vscode-languageserver-protocol";
import {
  formatParam,
  formatString,
  getUploadedName,
  showError,
  showInfo,
} from "./utils";

const _ = require("lodash");
const _db = require("lodash-id");
_.mixin(_db);

const writeFileP = promisify(fs.writeFile);
const readFileP = promisify(fs.readFile);

export interface INotice {
  body: string;
  text: string;
  title: string;
}

export interface IUploadName {
  date: string;
  dateTime: string;
  fileName: string;
  extName: string;
  mdFileName: string;
  [key: string]: string;
}

export interface IOutputUrl {
  uploadedName: string;
  url: string;
  [key: string]: string;
}

export enum EVSPicgoHooks {
  updated = "updated",
}

export default class VSPicgo extends EventEmitter {
  private static picgo: PicGo = new PicGo();
  public mode: string = "v";

  constructor() {
    super();
    this.configPicgo();
    // Before upload, we change names of the images.
    this.registerRenamePlugin();
    // After upload, we use the custom output format.
    this.addGenerateOutputListener();
  }

  configPicgo() {
    let config = workspace.getConfiguration("picgo");
    const picgoConfigPath = config.get<string>("configPath");
    if (picgoConfigPath) {
      VSPicgo.picgo.setConfig(
        JSON.parse(
          fs.readFileSync(picgoConfigPath, {
            encoding: "utf-8",
          })
        )
      );
    } else {
      const picBed = config.get("picBed");
      VSPicgo.picgo.setConfig({ picBed });
    }
  }

  addGenerateOutputListener() {
    VSPicgo.picgo.on("finished", async (ctx: PicGo) => {
      let urlText = "";
      const outputFormatTemplate =
        workspace.getConfiguration("picgo").get<string>("customOutputFormat") ||
        "![${uploadedName}](${url})";
      try {
        urlText = ctx.output.reduce(
          (acc: string, imgInfo: IImgInfo): string => {
            return `${acc}${formatString(outputFormatTemplate, {
              uploadedName: getUploadedName(imgInfo),
              url: imgInfo.imgUrl,
            })}\n`;
          },
          ""
        );
        urlText = urlText.trim();
        await this.updateData(ctx.output);
      } catch (err) {
        if (err instanceof SyntaxError) {
          showError(
            `the data file ${this.dataPath} has syntax error, ` +
              `please fix the error by yourself or delete the data file and vs-picgo will recreate for you.`
          );
        } else {
          showError(
            `failed to read from data file ${this.dataPath}: ${err || ""}`
          );
        }
        return;
      }
      const doc = await workspace.document;
      if (!doc) return;
      let edits: TextEdit[] = [];
      if (!this.mode) {
        const position = await workspace.getCursorPosition();
        edits = [TextEdit.insert(position, urlText)];
      } else {
        const mode = await workspace.nvim.call("mode");
        const range = await workspace.getSelectedRange(mode, doc);
        if (!range) return;
        edits = [TextEdit.replace(range, urlText)];
      }
      await doc.applyEdits(edits);
      showInfo(`image uploaded successfully.`);
      this.emit(EVSPicgoHooks.updated, urlText);
    });
  }

  registerRenamePlugin() {
    let beforeUploadPlugin: IPlugin = {
      handle: async (ctx: PicGo) => {
        const uploadNameTemplate =
          workspace.getConfiguration("picgo").get<string>("customUploadName") ||
          "${fileName}";
        if (ctx.output.length === 1) {
          ctx.output[0].fileName = await this.changeFilename(
            ctx.output[0].fileName || "",
            uploadNameTemplate,
            undefined
          );
        } else {
          for (let index = 0; index < ctx.output.length; index++) {
            ctx.output[index].fileName = await this.changeFilename(
              ctx.output[index].filename || "",
              uploadNameTemplate,
              index
            );
          }
        }
      },
    };
    if (VSPicgo.picgo.helper.beforeUploadPlugins.get("vsPicgoRenamePlugin")) {
      VSPicgo.picgo.helper.beforeUploadPlugins.unregister(
        "vsPicgoRenamePlugin"
      );
    }
    VSPicgo.picgo.helper.beforeUploadPlugins.register(
      "vsPicgoRenamePlugin",
      beforeUploadPlugin
    );
  }

  /**
   * Returns the modified file name as per `customUploadName` setting
   * @param original The filename of the original image file.
   * @param template The template string.
   */
  async changeFilename(
    original: string,
    template: string,
    index: number | undefined
  ) {
    const doc = await workspace.document;
    if (!doc) return;
    let selectedString: string;
    if (!this.mode) {
      selectedString = "";
    } else {
      const m = await workspace.nvim.call("visualmode");
      const range = await workspace.getSelectedRange(m, doc);
      if (!range) return;
      selectedString = doc.textDocument.getText(range);
    }
    const nameReg = /[:\/\?\$]+/g; // limitations of name
    const userDefineName = selectedString.replace(nameReg, () => "");
    if (userDefineName) {
      original = userDefineName + (index || "") + path.extname(original);
    }
    const mdFilePath = Uri.parse(doc.uri).fsPath;
    const mdFileName = path.basename(mdFilePath, path.extname(mdFilePath));
    let uploadNameData = formatParam(original, mdFileName);
    return formatString(template, uploadNameData);
  }

  get dataPath(): string {
    const picgoConfig = workspace.getConfiguration("picgo");
    return (
      picgoConfig.dataPath || path.resolve(os.homedir(), "vs-picgo-data.json")
    );
  }

  async initDataFile(dataPath: string) {
    if (!fs.existsSync(dataPath)) {
      await writeFileP(
        dataPath,
        JSON.stringify({ uploaded: [] }, null, 2),
        "utf8"
      );
    }
  }

  async upload(input?: string[]): Promise<string | void | Error> {
    // This is necessary, because user may have changed settings
    this.configPicgo();

    // uploading progress
    VSPicgo.picgo.on("uploadProgress", (p: number) => {
      showInfo(`image uploading ${p}% ...`);
    });
    VSPicgo.picgo.on("notification", (notice: INotice) => {
      showError(`${notice.title}! ${notice.body || ""}${notice.text || ""}`);
    });
    VSPicgo.picgo.on("failed", () => {
      showError(`image upload failed`);
    });

    return VSPicgo.picgo.upload(input);
  }

  async updateData(picInfos: Array<IImgInfo>) {
    const dataPath = this.dataPath;
    if (!fs.existsSync(dataPath)) {
      await this.initDataFile(dataPath);
      showInfo("data file created at ${dataPath}.");
    }
    const dataRaw = await readFileP(dataPath, "utf8");
    const data = JSON.parse(dataRaw);
    if (!data.uploaded) {
      data.uploaded = [];
    }
    picInfos.forEach((picInfo) => {
      _.insert(data["uploaded"], picInfo);
    });
    await writeFileP(dataPath, JSON.stringify(data, null, 2), "utf8");
  }
}
