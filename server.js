import express from "express";
import puppeteer from "puppeteer";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const CALLBACK_URL = process.env.CALLBACK_URL;

console.log("Starting application...");

app.use(express.json());

app.post("/run-puppeteer", (req, res) => {
  console.log("Received request:", req.body);
  const { url, orderSpecifications } = req.body;

  if (!url || !Array.isArray(orderSpecifications)) {
    return res.status(400).json({ error: "Invalid input data" });
  }

  const jobId = uuidv4();
  const jobData = { url, orderSpecifications, status: "pending", jobId };

  res.json({ jobId });

  // Process the job asynchronously
  processJob(jobId, jobData).catch((error) => {
    console.error("Error processing job:", error);
  });
});

async function processJob(jobId, jobData) {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await puppeteer.launch({
      headless: true,
      //  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser",
      args: [
        "--enable-webgl",
        "--ignore-gpu-blacklist",
        "--enable-gpu-rasterization",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--disable-default-apps",
        "--disable-features=site-per-process",
        "--disable-breakpad",
        "--disable-canvas-aa",
        "--disable-2d-canvas-clip-aa",
        "--disable-web-security",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-infobars",
      ],
    });

    console.log("Browser launched successfully");
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 800 });

    const waitForAllAssetsLoaded = new Promise((resolve) => {
      page.on("console", (msg) => {
        if (msg.text().includes("AllAssetsLoaded!")) {
          resolve();
        }
      });
    });

    console.log("Navigating to page...");
    await page.goto(jobData.url, {
      waitUntil: "networkidle0",
      timeout: 300000, // Increase timeout to 5 minutes (300,000 milliseconds)
    });

    console.log('Waiting for "AllAssetsLoaded!" console message...');
    await waitForAllAssetsLoaded;
    console.log('"AllAssetsLoaded!" console message received.');

    console.log("Sending SKU details and configurations to PlayCanvas...");
    for (const spec of jobData.orderSpecifications) {
      const details = { type: "SKU_details", sku: spec.sku };

      if (spec.properties) {
        if (spec.properties.font) {
          details.font = spec.properties.font;
        }
        if (spec.properties.engravingText) {
          details.engravingText = spec.properties.engravingText;
        }
        if (spec.properties.printImage) {
          details.printImage = spec.properties.printImage;
        }
      }

      await page.evaluate(
        (details) => window.postMessage(details, "*"),
        details
      );
    }

    console.log("Taking screenshots from different angles...");
    const screenshots = [];
    const cameraAngles = [7, 5, 8];

    for (let index of cameraAngles) {
      await page.evaluate(
        (index) => window.postMessage({ type: "CameraChange", index }, "*"),
        index
      );
      await new Promise((resolve) => setTimeout(resolve, 1250));
      const buffer = await page.screenshot();
      console.log("Screenshot taken! Camera: ", index);
      screenshots.push(buffer.toString("base64"));
    }

    jobData.status = "finished";
    jobData.screenshots = screenshots;

    await notifyMainApp(jobId, jobData);
  } catch (error) {
    console.error("Error during job processing:", error);
    jobData.status = "failed";
    jobData.error = error.message;
    await notifyMainApp(jobId, jobData);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function notifyMainApp(jobId, jobData) {
  try {
    await fetch(CALLBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        status: jobData.status,
        screenshots: jobData.screenshots,
        error: jobData.error,
      }),
    });
  } catch (error) {
    console.error("Error notifying main app:", error);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.get("/", (req, res) => {
  res.send("Puppeteer Cloud Run Service is up and running!");
});
