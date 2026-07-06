**安装 Node.js**
   脚本用的是 Node 原生 `fetch`，建议 Node `18+`。

**全量运行**
```powershell
node outputs\csh_school_spider.mjs 
```

**只获取河南省**
```powershell
node outputs\csh_school_spider.mjs --province-code 410000000000
```

**重新跑进度但保留已有结果**
```powershell
node outputs\csh_school_spider.mjs --province-code 410000000000 --force
```

**清空结果重新跑**
```powershell
node outputs\csh_school_spider.mjs --province-code 410000000000 --force --reset-output
```

**修改大学名单文件（剔除大学记录）**
   当前默认读取：

```js
C:/Users/kaihe/Desktop/所有大学.json
```

换设备后这个路径大概率不存在。运行时用参数指定新路径即可：

```powershell
node outputs\csh_school_spider.mjs --university-file "D:\data\所有大学.json"
```

**结果和进度文件路径**
   默认写到当前执行目录下：

```text
outputs/csh_schools.json
outputs/csh_progress.json
```

如果换设备继续之前的进度，把这两个文件一起拷过去，并保持命令里的 `--output`、`--progress` 指向它们：

```powershell
node outputs\csh_school_spider.mjs `
  --university-file "D:\data\所有大学.json" `
  --output "D:\data\csh_schools.json" `
  --progress "D:\data\csh_progress.json"
```

**如果重新开始**
   不带旧进度，或者加：

```powershell
--force --reset-output
```

例如：

```powershell
node outputs\csh_school_spider.mjs `
  --university-file "D:\data\所有大学.json" `
  --force --reset-output
```

**不要直接改脚本也可以**
   只有默认大学名单路径是写死的。你可以不改代码，靠 `--university-file` 覆盖。若想永久改，改脚本顶部的：

```js
const DEFAULT_UNIVERSITY_FILE = "C:/Users/kaihe/Desktop/所有大学.json";
```

最稳妥的迁移包就是：`csh_school_spider.mjs`、`所有大学.json`、如果要断点续跑再加 `csh_schools.json` 和 `csh_progress.json`。

**同一个请求最多重试 5 次，全部失败后中断**
