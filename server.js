const express = require("express");
require("dotenv").config();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());


// -------- Trie for Autocompletion --------

class TrieNode {
  constructor() {
    this.children = {};
    this.isEnd = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) {
        node.children[ch] = new TrieNode();
      }
      node = node.children[ch];
    }
    node.isEnd = true;
  }

  autocomplete(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children[ch]) return [];
      node = node.children[ch];
    }
    let result = [];
    this.dfs(node, prefix, result);
    return result;
  }

  dfs(node, word, result) {
    if (node.isEnd) result.push(word);
    for (const ch in node.children) {
      this.dfs(node.children[ch], word + ch, result);
    }
  }
}

const trie = new Trie();

[
  "function", "for", "if", "else", "class",
  "public", "static", "console", "log",
  "import", "try", "catch"
].forEach(w => trie.insert(w));


app.get("/autocomplete", (req, res) => {
  const prefix = req.query.prefix || "";
  res.json(trie.autocomplete(prefix));
});


// -------- Code Execution (JavaScript + Java) --------

app.post("/run", (req, res) => {
  const { code, language } = req.body;

  if (!code) {
    return res.status(400).json({ output: "Code is required." });
  }

  if (language === "javascript") {
    try {
      let logs = [];
      const original = console.log;
      console.log = (...args) => logs.push(args.join(" "));
      eval(code);
      console.log = original;

      return res.json({
        output: logs.join("\n") || "Executed with no output."
      });

    } catch (err) {
      return res.json({ output: "Error: " + err.message });
    }
  }

  else if (language === "java") {

    const file = "Temp.java";
    fs.writeFileSync(file, code);

    exec("javac Temp.java", (err, _, stderr) => {
      if (err) {
        fs.unlinkSync(file);
        return res.json({ output: stderr });
      }

      exec("java Temp", (rerr, stdout, rstderr) => {
        fs.unlinkSync(file);
        if (fs.existsSync("Temp.class"))
          fs.unlinkSync("Temp.class");

        if (rerr)
          return res.json({ output: rstderr });

        res.json({ output: stdout });
      });
    });
  }

  else {
    res.json({ output: "Only JavaScript and Java supported." });
  }
});


// -------- AI Code Correction Chatbot --------

app.post("/chatbot", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      response: "Code is required."
    });
  }

  try {
    const cohere = new CohereClientV2({
      token: process.env.COHERE_API_KEY
    });

    const aiResponse = await cohere.generate({
      model: "command-r-plus",
      prompt: `Fix errors in this code:\n\n${code}`,
      max_tokens: 300,
      temperature: 0.5
    });

    res.json({
      response: aiResponse.generations[0].text.trim()
    });

  } catch (error) {
    res.status(500).json({
      response: "AI processing failed."
    });
  }
});


// -------- Start Server --------

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
