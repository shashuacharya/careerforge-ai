import { marked } from 'marked';
import fs from 'fs';

const md = fs.readFileSync('report/CareerForge_AI_Project_Report.md', 'utf-8');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body {
        font-family: 'Times New Roman', serif;
        font-size: 12pt;
        line-height: 1.5;
        max-width: 800px;
        margin: 40px auto;
        padding: 20px;
    }
    h1 { font-size: 24pt; text-align: center; margin-top: 40px; page-break-before: always; }
    h2 { font-size: 18pt; margin-top: 30px; border-bottom: 1px solid #ccc; }
    h3 { font-size: 14pt; margin-top: 20px; }
    p { margin-bottom: 15px; text-align: justify; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid black; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    code { background-color: #f5f5f5; padding: 2px 5px; font-family: 'Courier New', monospace; }
    pre { background-color: #f5f5f5; padding: 15px; overflow-x: auto; border: 1px solid #ddd; }
    .page-break { page-break-before: always; }
</style>
</head>
<body>
${marked(md)}
</body>
</html>
`;

fs.writeFileSync('report/CareerForge_AI_Project_Report.html', htmlContent);
console.log("Successfully created HTML report!");
