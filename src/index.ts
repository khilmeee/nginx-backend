import fs from "fs";
import express from "express";
import config from "./config";
import path from "path";
import bodyParser from "body-parser";
import Nginx from "./nginx";
import Templates from "./templates";
import Logger from "./logger";
import Stream from "./stream";

const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
);
const app = express();

app.use(bodyParser.json());
app.use((req, res, next) => {
    if (req.headers.authorization !== config.authorization) {
        res.status(401).json({
            error: "Unauthorizated",
            statusCode: 401,
        });
    } else {
        next();
    }
});

app.get("/", (req, res) => {
    res.json({
        version: pkg.version,
        statusCode: 200,
    });
});

app.get("/streams", async (req, res) => {
    const streams = await Stream.get();
    res.json(streams);
});

app.post("/streams", async (req, res) => {
    const name = req.body.name;
    const listen = req.body.listen;
    const target = req.body.target;
    if (!name || !listen || !target) {
        return res.status(400).json({
            error: "Invalid request",
            statusCode: 400,
        });
    }
    if (!Stream.checkName(name)) {
        return res.status(400).json({
            error: "Invalid name",
            statusCode: 400,
        });
    }
    if (!Stream.checkListen(listen)) {
        return res.status(400).json({
            error: "Invalid listen",
            statusCode: 400,
        });
    }
    if (!Stream.checkTarget(target)) {
        return res.status(400).json({
            error: "Invalid target",
            statusCode: 400,
        });
    }

    try {
        await Stream.create({
            name,
            listen,
            target,
        });
    } catch {
        return res.status(500).json({
            error: "Could not create stream",
            statusCode: 500,
        });
    }

    if (!(await Nginx.test())) {
        Logger.error(`Could not reload nginx, deleting stream: ${name}`);
        await Stream.delete(name);

        return res.status(500).json({
            error: "Nginx configuration failed",
            statusCode: 500,
        });
    }

    Logger.info(`Stream created: ${name} - ${listen} -> ${target}`);
    res.json({
        message: "Stream created",
        statusCode: 200,
    });

    return await Nginx.reload();
});

app.delete("/streams/:name", async (req, res) => {
    const name = req.params.name;

    try {
        await Stream.delete(name);
    } catch {
        return res.status(500).json({
            error: "Could not delete stream",
            statusCode: 500,
        });
    }

    Logger.info(`Stream deleted: ${name}`);
    res.json({
        message: "Stream deleted",
        statusCode: 200,
    });

    if (await Nginx.test()) {
        return await Nginx.reload();
    }
    return;
});

/*
 * Error Handling
 */

app.use((req, res) => {
    res.status(404).json({
        error: `${req.method} ${req.path} not found`,
        statusCode: 404,
    });
});

app.use((error: any, req: any, res: any, next: any) => {
    Logger.error(error);
    res.status(500).json({
        error: String(error),
        stack: String(error.stack),
        statusCode: 500,
    });
});

async function bootstrap() {
    await Templates.load();
    app.listen(config.port, config.address, () => {
        Logger.info(`Listening on ${config.address}:${config.port}`);
    });
}

bootstrap();
