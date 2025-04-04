
const express = require("express");
const { CohereClientV2 } = require("cohere-ai");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const fetch = require("node-fetch"); // Ensure node-fetch is installed
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Trie Implementation for Autocompletion ---
class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }
  
  insert(word) {
    let node = this.root;
    for (const char of word) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEndOfWord = true;
  }
  
  autocomplete(prefix) {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children[char]) return [];
      node = node.children[char];
    }
    const suggestions = [];
    this._dfs(node, prefix, suggestions);
    return suggestions;
  }
  
  _dfs(node, prefix, suggestions) {
    if (node.isEndOfWord) suggestions.push(prefix);
    for (const char in node.children) {
      this._dfs(node.children[char], prefix + char, suggestions);
    }
  }
}

const trie = new Trie();
const codeSnippets = [
  "function", "for", "if", "else", "while", "class", "public", "private",
  "protected", "static", "import", "export", "def", "try", "catch", "finally"
];
codeSnippets.forEach(snippet => trie.insert(snippet));

app.get("/autocomplete", (req, res) => {
  const { prefix } = req.query;
  if (!prefix) return res.json([]);
  const suggestions = trie.autocomplete(prefix);
  res.json(suggestions);
});

// Run code endpoint (supports JavaScript, Python, C++, Java)
app.post("/run", (req, res) => {
  const { code, language } = req.body;
  
  if (language === "javascript") {
    try {
      let output = "";
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.join(" "));
        originalLog.apply(console, args);
      };
      eval(code);
      console.log = originalLog;
      output = logs.join("\n") || "Executed successfully with no output.";
      return res.json({ output });
    } catch (error) {
      return res.json({ output: "Error: " + error.message });
    }
  }
  else if (language === "python") {
    const filename = "temp.py";
    fs.writeFileSync(filename, code);
    exec(`python3 ${filename}`, (error, stdout, stderr) => {
      fs.unlinkSync(filename);
      if (error) return res.json({ output: stderr || error.message });
      res.json({ output: stdout });
    });
  }
  else if (language === "cpp") {
    const sourceFile = "temp.cpp";
    const exeFile = "tempExe";
    fs.writeFileSync(sourceFile, code);
    exec(`g++ ${sourceFile} -o ${exeFile}`, (compileErr, compileStdout, compileStderr) => {
      if (compileErr) {
        fs.unlinkSync(sourceFile);
        return res.json({ output: compileStderr || compileErr.message });
      }
      exec(`./${exeFile}`, (runErr, runStdout, runStderr) => {
        fs.unlinkSync(sourceFile);
        fs.unlinkSync(exeFile);
        if (runErr) return res.json({ output: runStderr || runErr.message });
        res.json({ output: runStdout });
      });
    });
  }
  else if (language === "java") {
    const sourceFile = "Temp.java";
    fs.writeFileSync(sourceFile, code);
    exec(`javac ${sourceFile}`, (compileErr, compileStdout, compileStderr) => {
      if (compileErr) {
        fs.unlinkSync(sourceFile);
        return res.json({ output: compileStderr || compileErr.message });
      }
      exec(`java Temp`, (runErr, runStdout, runStderr) => {
        fs.unlinkSync(sourceFile);
        if (fs.existsSync("Temp.class")) fs.unlinkSync("Temp.class");
        if (runErr) return res.json({ output: runStderr || runErr.message });
        res.json({ output: runStdout });
      });
    });
  }
  else {
    res.json({ output: "Execution not supported for this language." });
  }
});

// Optimize Code Endpoint
app.post("/optimize", (req, res) => {
  const { code, language } = req.body;
  let optimizedCode = code;
  
  if (language === "python") {
    const filename = "temp.py";
    fs.writeFileSync(filename, code);
    exec(`python -m autopep8 ${filename}`, (error, stdout, stderr) => {
      fs.unlinkSync(filename);
      if (!error && stdout) {
        optimizedCode = stdout;
        return res.json({ optimizedCode });
      } else {
        if (!code.includes("if __name__ == '__main__':")) {
          let indented = code.split('\n').map(line => "    " + line).join('\n');
          optimizedCode = `def main():\n${indented}\n\nif __name__ == '__main__':\n    main()`;
        }
        return res.json({ optimizedCode });
      }
    });
    return;
  }
  else if (language === "java") {
    if (!code.includes("public static void main")) {
      let indented = code.split('\n').map(line => "        " + line).join('\n');
      optimizedCode = `public class Temp {\n    public static void main(String[] args) {\n${indented}\n    }\n}`;
    }
  }
  else if (language === "cpp") {
    if (!code.includes("int main(")) {
      let indented = code.split('\n').map(line => "    " + line).join('\n');
      optimizedCode = `#include <iostream>\nusing namespace std;\n\nint main() {\n${indented}\n    return 0;\n}`;
    }
  }
  else if (language === "javascript") {
    optimizedCode = code.replace(/error/g, "").trim();
  }
  
  res.json({ optimizedCode });
});

const cohere = new CohereClientV2({
    token: "process.env.COHERE_API_KEY", // Ensure this is set in your .env file
  });
  // Define the POST route
  app.post("/chatbot", async (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ response: "Code is required." });
    }
    
    // Determine if the code appears to be Java
    let languageTag = "";
    if (code.includes("public class") || code.includes("import java")) {
      languageTag = "Java";
    }
    
    // Build prompt based on detected language
    const prompt = languageTag === "Java"
      ? `Fix the errors in the following Java code and provide the corrected Java code along with a brief explanation:\n\n${code}\n\nCorrected Java code and explanation:`
      : `Fix the errors in the following code and provide the corrected version along with a brief explanation:\n\n${code}\n\nCorrected code and explanation:`;
    
    try {
      const response = await fetch("https://api.cohere.ai/generate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "command-r-plus",
          prompt: prompt,
          max_tokens: 300,
          temperature: 0.5,
          k: 0,
          p: 0.75,
          frequency_penalty: 0,
          presence_penalty: 0,
          stop_sequences: ["\n"]
        })
      });
      
      const data = await response.json();
      const generation = data.generations && data.generations[0] ? data.generations[0].text.trim() : "No response from Cohere.";
      res.json({ response: generation });
    } catch (error) {
      console.error("Cohere API Error:", error);
      res.status(500).json({ response: "Failed to fetch AI response." });
    }
  });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
