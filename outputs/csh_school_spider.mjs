#!/usr/bin/env node

// Crawl school names from www.csh.moe.edu.cn.
//
// Output format is a flat JSON string array, matching the shape of:
//   C:/Users/kaihe/Desktop/所有大学.json
//
// The site returns HTML, not JSON. This script submits normal form fields:
//   mdepartmentExt.parentId, mdepartmentExt.xxjgmc, pageSize, pageIndex
//
// Checkpointing:
//   - output JSON is rewritten after every successful page
//   - progress JSON is rewritten after every successful page
//   - rerun the same command after interruption to continue

import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name !== "Warning" || !String(warning.message).includes("NODE_TLS_REJECT_UNAUTHORIZED")) {
    console.warn(warning.stack || warning.message);
  }
});

const BASE_URL = "https://www.csh.moe.edu.cn";
const LIST_PATH = "/moetc/mdepartmentExtAction!toMdepartmentExtListWdOuter.action";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;
const SCHOOL_NAME_MARKERS = [
  "学",
  "校",
  "高中",
  "初中",
  "小学",
  "中学",
  "完中",
  "职高",
  "职中",
  "中职",
  "中专",
  "职业",
  "职教",
  "技工",
  "技师",
  "幼儿园",
  "幼儿",
  "幼稚园",
  "托儿所",
  "托幼",
  "托育",
  "早教",
  "保育院",
  "附属",
  "附中",
  "附小",
  "附幼",
  "中心",
  "教育",
  "教学点",
  "办学点",
  "培训",
  "进修",
  "专修",
  "函授",
  "书院",
  "特教",
  "特殊教育",
  "培智",
  "启智",
  "启聪",
  "盲校",
  "聋校",
  "工读"
];
const DEFAULT_KEYWORDS = SCHOOL_NAME_MARKERS;
const DEFAULT_UNIVERSITY_FILE = "C:/Users/90924/Desktop/所有大学.json";
const PROVINCES = [
  ["110000000000", "北京市"],
  ["120000000000", "天津市"],
  ["130000000000", "河北省"],
  ["140000000000", "山西省"],
  ["150000000000", "内蒙古自治区"],
  ["210000000000", "辽宁省"],
  ["220000000000", "吉林省"],
  ["230000000000", "黑龙江省"],
  ["310000000000", "上海市"],
  ["320000000000", "江苏省"],
  ["330000000000", "浙江省"],
  ["340000000000", "安徽省"],
  ["350000000000", "福建省"],
  ["360000000000", "江西省"],
  ["370000000000", "山东省"],
  ["410000000000", "河南省"],
  ["420000000000", "湖北省"],
  ["430000000000", "湖南省"],
  ["440000000000", "广东省"],
  ["450000000000", "广西壮族自治区"],
  ["460000000000", "海南省"],
  ["500000000000", "重庆市"],
  ["510000000000", "四川省"],
  ["520000000000", "贵州省"],
  ["530000000000", "云南省"],
  ["540000000000", "西藏自治区"],
  ["610000000000", "陕西省"],
  ["620000000000", "甘肃省"],
  ["630000000000", "青海省"],
  ["640000000000", "宁夏回族自治区"],
  ["650000000000", "新疆维吾尔自治区"],
  ["660000000000", "新疆建设兵团"],
];

function parseArgs(argv) {
  const args = {
    output: "outputs/csh_schools.json",
    progress: "outputs/csh_progress.json",
    rawOutput: "outputs/csh_schools_raw.json",
    universityFile: DEFAULT_UNIVERSITY_FILE,
    keywords: DEFAULT_KEYWORDS,
    pageSize: 500,
    delay: 800,
    timeout: 30000,
    maxRetries: 5,
    retrySleep: 2000,
    provinceCode: null,
    provinceName: null,
    limitProvinces: null,
    maxPagesPerKeyword: null,
    force: false,
    resetOutput: false,
    saveRaw: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${item}`);
      return argv[i];
    };
    if (item === "--output") args.output = next();
    else if (item === "--progress") args.progress = next();
    else if (item === "--raw-output") args.rawOutput = next();
    else if (item === "--university-file") args.universityFile = next();
    else if (item === "--page-size") args.pageSize = Number(next());
    else if (item === "--delay") args.delay = Number(next());
    else if (item === "--timeout") args.timeout = Number(next());
    else if (item === "--max-retries") args.maxRetries = Number(next());
    else if (item === "--retry-sleep") args.retrySleep = Number(next());
    else if (item === "--province-code") args.provinceCode = next();
    else if (item === "--province-name") args.provinceName = next();
    else if (item === "--limit-provinces") args.limitProvinces = Number(next());
    else if (item === "--max-pages-per-keyword") args.maxPagesPerKeyword = Number(next());
    else if (item === "--force") args.force = true;
    else if (item === "--reset-output") args.resetOutput = true;
    else if (item === "--save-raw") args.saveRaw = true;
    else if (item === "--keywords") {
      const values = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        values.push(argv[i + 1]);
        i += 1;
      }
      args.keywords = values.length ? values : DEFAULT_KEYWORDS;
    } else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${item}`);
    }
  }

  if (!Number.isFinite(args.pageSize) || args.pageSize < 1) throw new Error("--page-size must be positive");
  return args;
}

function printHelp() {
  console.log(`Usage:
node outputs/csh_school_spider.mjs [options]

Default output:
  outputs/csh_schools.json      flat JSON array of school names
  outputs/csh_progress.json     checkpoint for interruption/resume

Options:
  --output <path>               JSON string-array output path
  --progress <path>             checkpoint JSON path
  --university-file <path>      university-name JSON array used for final filtering
  --keywords <words...>         keywords, default:
                                ${DEFAULT_KEYWORDS.join(" ")}
  --page-size <n>               pageSize form value, default 500
  --delay <ms>                  delay between requests, default 800
  --timeout <ms>                request timeout, default 30000
  --max-retries <n>             request retries, default 5
  --retry-sleep <ms>            base retry sleep, default 2000
  --province-code <code>        crawl one province directly, no city/county expansion
  --province-name <name>        crawl one province by name
  --limit-provinces <n>         debug: only first N province tasks
  --max-pages-per-keyword <n>   debug: cap pages per keyword
  --force                       ignore existing progress and restart requested tasks
  --reset-output                start with an empty output set
  --save-raw                    additionally write raw name array before university filtering
  --raw-output <path>           raw output path when --save-raw is used

Examples:
  node outputs/csh_school_spider.mjs
  node outputs/csh_school_spider.mjs --province-code 410000000000
  node outputs/csh_school_spider.mjs --province-name 河南省 --force
`);
}

function actionUrl(provinceCode) {
  const url = new URL(LIST_URL);
  url.searchParams.set("cityId", provinceCode);
  url.searchParams.set("mdepartmentExt.type", "3");
  return url.toString();
}

function selectProvinceTasks(args) {
  let tasks = PROVINCES.map(([code, name]) => ({ provinceCode: code, provinceName: name }));
  if (args.provinceCode) {
    tasks = tasks.filter((task) => task.provinceCode === args.provinceCode);
  }
  if (args.provinceName) {
    tasks = tasks.filter((task) => task.provinceName.includes(args.provinceName));
  }
  if (args.limitProvinces) tasks = tasks.slice(0, args.limitProvinces);
  if (!tasks.length) {
    throw new Error("no matching province task");
  }
  return tasks;
}

async function fetchHtml(url, { data, args }) {
  let lastError = null;
  for (let attempt = 1; attempt <= args.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeout);
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Connection: "close",
      };
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: new URLSearchParams(data),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (looksLikeMaintenance(text)) throw new Error("site appears to be in maintenance mode");
      return text;
    } catch (error) {
      lastError = error;
      if (attempt === args.maxRetries) break;
      const wait = args.retrySleep * attempt + Math.floor(Math.random() * args.retrySleep);
      console.warn(`request failed, retrying in ${wait}ms: ${lastError?.message || lastError}`);
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`failed to fetch ${url}: ${lastError?.message || lastError}`);
}

function looksLikeMaintenance(text) {
  return /系统维护|网站维护|维护中|暂停服务/.test(normalizeText(text));
}

function normalizeText(text) {
  return decodeEntities(String(text)).replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripTags(text) {
  return normalizeText(text.replace(/<[^>]+>/g, ""));
}

function extractTotal(pageHtml) {
  const match = pageHtml.match(/\.pager\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function extractSchoolNames(pageHtml) {
  const names = [];
  const rowPattern =
    /<tr>\s*<TD[^>]*class=["']h_tdListCenter["'][^>]*>([\s\S]*?)<\/td>\s*<TD[^>]*class=["']h_tdListCenter1["'][^>]*>([\s\S]*?)<\/TD>\s*<\/tr>/gi;
  let match;
  while ((match = rowPattern.exec(pageHtml))) {
    const schoolName = stripTags(match[1]);
    const schoolId = stripTags(match[2]);
    if (schoolName && keepByBasicSchoolRule(schoolName, schoolId)) {
      names.push(schoolName);
    }
  }
  return names;
}

function keepByBasicSchoolRule(name, schoolId) {
  const excluded = [
    "sshaabidongxi"
  ];
  if (excluded.some((word) => name.includes(word))) return false;

  if (!SCHOOL_NAME_MARKERS.some((word) => name.includes(word))) return false;

  // Codes beginning with 4 are usually higher education in this site.
  if (/^4/.test(schoolId) && !/(附属|附中|附小|附幼)/.test(name)) return false;
  return true;
}

function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`${filePath} is not a JSON array`);
  return data;
}

function loadNameSet(filePath) {
  return new Set(loadJsonArray(filePath).map((item) => normalizeText(item)).filter(Boolean));
}

function loadProgress(progressPath) {
  if (!fs.existsSync(progressPath)) {
    return { completed: {}, current: null, updatedAt: null };
  }
  return JSON.parse(fs.readFileSync(progressPath, "utf8"));
}

function saveProgress(progressPath, progress) {
  progress.updatedAt = new Date().toISOString();
  writeJsonAtomic(progressPath, progress);
}

function loadExistingNames(outputPath) {
  return new Set(loadJsonArray(outputPath).map((item) => normalizeText(item)).filter(Boolean));
}

function writeNameArray(outputPath, names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  writeJsonAtomic(outputPath, sorted);
}

function writeJsonAtomic(filePath, data) {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
}

function isTaskDone(progress, provinceCode, keyword) {
  return Boolean(progress.completed?.[provinceCode]?.keywords?.[keyword]?.done);
}

function getNextPage(progress, provinceCode, keyword) {
  const item = progress.completed?.[provinceCode]?.keywords?.[keyword];
  if (!item) return 1;
  return Number(item.nextPage || 1);
}

function markPageDone(progress, province, keyword, nextPage, total, totalPages) {
  if (!progress.completed[province.provinceCode]) {
    progress.completed[province.provinceCode] = {
      provinceName: province.provinceName,
      keywords: {},
      done: false,
    };
  }
  progress.completed[province.provinceCode].keywords[keyword] = {
    done: nextPage > totalPages,
    nextPage,
    total,
    totalPages,
  };
  progress.current = {
    provinceCode: province.provinceCode,
    provinceName: province.provinceName,
    keyword,
    nextPage,
    total,
    totalPages,
  };
}

function markProvinceDone(progress, province, keywords) {
  if (!progress.completed[province.provinceCode]) {
    progress.completed[province.provinceCode] = {
      provinceName: province.provinceName,
      keywords: {},
      done: false,
    };
  }
  progress.completed[province.provinceCode].done = keywords.every((keyword) =>
    progress.completed[province.provinceCode].keywords?.[keyword]?.done
  );
  if (progress.completed[province.provinceCode].done) {
    progress.current = null;
  }
}

function filterUniversities(names, universityNames) {
  const filtered = new Set();
  let removed = 0;
  for (const name of names) {
    if (universityNames.has(name)) {
      removed += 1;
      continue;
    }
    filtered.add(name);
  }
  return { filtered, removed };
}

async function politePause(delayMs) {
  if (delayMs > 0) {
    await sleep(delayMs + Math.floor(Math.random() * Math.min(delayMs, 500)));
  }
}

async function crawl(args) {
  const tasks = selectProvinceTasks(args);
  const universityNames = loadNameSet(args.universityFile);
  const progress = args.force ? { completed: {}, current: null, updatedAt: null } : loadProgress(args.progress);
  const names = args.resetOutput ? new Set() : loadExistingNames(args.output);

  console.log(`province tasks: ${tasks.length}`);
  console.log(`keywords: ${args.keywords.join(", ")}`);
  console.log(`loaded university names: ${universityNames.size}`);
  console.log(`existing output names: ${names.size}`);

  const stopState = { requested: false };
  const stopHandler = () => {
    stopState.requested = true;
    console.log("interrupt requested, will stop after the current successful page is saved...");
  };
  process.once("SIGINT", stopHandler);
  process.once("SIGTERM", stopHandler);

  for (const province of tasks) {
    console.log(`province ${province.provinceName} ${province.provinceCode}`);
    for (const keyword of args.keywords) {
      if (!args.force && isTaskDone(progress, province.provinceCode, keyword)) {
        console.log(`  keyword=${JSON.stringify(keyword)} already done`);
        continue;
      }

      let pageIndex = args.force ? 1 : getNextPage(progress, province.provinceCode, keyword);
      let totalPages = Infinity;
      let total = 0;
      while (pageIndex <= totalPages) {
        if (args.maxPagesPerKeyword) totalPages = Math.min(totalPages, args.maxPagesPerKeyword);
        const html = await fetchHtml(actionUrl(province.provinceCode), {
          args,
          data: {
            "mdepartmentExt.parentId": province.provinceCode,
            "mdepartmentExt.xxjgmc": keyword,
            pageSize: String(args.pageSize),
            pageIndex: String(pageIndex),
          },
        });
        total = extractTotal(html);
        totalPages = total ? Math.max(1, Math.ceil(total / args.pageSize)) : 1;
        if (args.maxPagesPerKeyword) totalPages = Math.min(totalPages, args.maxPagesPerKeyword);

        const pageNames = extractSchoolNames(html);
        const before = names.size;
        for (const name of pageNames) names.add(name);
        const added = names.size - before;

        if (args.saveRaw) {
          writeNameArray(args.rawOutput, names);
        }
        const { filtered, removed } = filterUniversities(names, universityNames);
        writeNameArray(args.output, filtered);
        markPageDone(progress, province, keyword, pageIndex + 1, total, totalPages);
        saveProgress(args.progress, progress);

        console.log(
          `  keyword=${JSON.stringify(keyword)} page=${pageIndex}/${totalPages} total=${total} page_kept=${pageNames.length} added=${added} output=${filtered.size} university_removed=${removed}`,
        );

        if (stopState.requested) {
          console.log("stopped safely after saving current page and progress");
          return;
        }
        pageIndex += 1;
        await politePause(args.delay);
      }
    }
    markProvinceDone(progress, province, args.keywords);
    saveProgress(args.progress, progress);
  }

  const { filtered, removed } = filterUniversities(names, universityNames);
  writeNameArray(args.output, filtered);
  if (args.saveRaw) writeNameArray(args.rawOutput, names);
  console.log(`done. output=${args.output}, names=${filtered.size}, university_removed=${removed}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  await crawl(args);
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}
