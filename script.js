
// Configure Monaco Editor loader
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs' }});

require(['vs/editor/editor.main'], function() {
  // Create the Monaco editor instance with a dark theme
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Type your code here\nconsole.log("Hello, Monaco!");',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true
  });

  // Register a completion provider for JavaScript
  monaco.languages.registerCompletionItemProvider('javascript', {
    // Trigger suggestions on common characters
    triggerCharacters: ['.', ' ', '\n'],
    provideCompletionItems: async function(model, position) {
      // Get text until the cursor
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      // Extract the last token typed
      const lastToken = getLastToken(textUntilPosition);

      // Local suggestions (hard-coded snippets/keywords)
      const localSuggestions = [
        { label: 'console.log', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'console.log(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
        { label: 'function', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'function ' },
        { label: 'return', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'return ' },
        { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if ' },
        { label: 'else', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'else ' }
      ];

      // Optionally fetch backend suggestions
      let backendSuggestions = [];
      try {
        const resp = await fetch(`/autocomplete?prefix=${encodeURIComponent(lastToken)}`);
        const data = await resp.json();
        backendSuggestions = data.map(item => ({
          label: item,
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: item
        }));
      } catch (e) {
        console.error('Error fetching backend suggestions:', e);
      }

      // Combine local and backend suggestions
      const suggestions = [...localSuggestions, ...backendSuggestions];
      
      return {
        suggestions: suggestions.map(s => ({
          label: s.label,
          kind: s.kind,
          insertText: s.insertText,
          insertTextRules: s.insertTextRules,
          range: getReplaceRange(model, position, lastToken)
        }))
      };
    }
  });

  // Helper to extract last token from text
  function getLastToken(text) {
    const tokens = text.trim().split(/[\s(){};.,]+/);
    return tokens[tokens.length - 1] || '';
  }

  // Helper to determine range to replace
  function getReplaceRange(model, position, lastToken) {
    const column = position.column;
    const lineNumber = position.lineNumber;
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: column - lastToken.length,
      endColumn: column
    };
  }

  // Debounce helper (if needed for other operations)
  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Handle language dropdown changes
  document.getElementById("language-select").addEventListener("change", function(e) {
    const language = e.target.value;
    let monacoLang;
    switch(language) {
      case 'java':       monacoLang = "java";       break;
      case 'cpp':        monacoLang = "cpp";        break;
      case 'javascript': monacoLang = "javascript"; break;
      case 'python':     monacoLang = "python";     break;
      default:           monacoLang = "javascript";
    }
    monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
  });

  // Run code: send code to /run endpoint
  document.getElementById("run-button").addEventListener("click", async function() {
    const code = editor.getValue();
    const language = document.getElementById("language-select").value;
    try {
      const response = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      });
      const result = await response.json();
      document.getElementById("output").textContent = result.output;
    } catch (error) {
      console.error("Error running code:", error);
      document.getElementById("output").textContent = "Error running code.";
    }
  });
  
  // Optimize code: send code to /optimize endpoint and update editor and output panel with optimized code
  document.getElementById("optimize-button").addEventListener("click", async function() {
    const code = editor.getValue();
    const language = document.getElementById("language-select").value;
    try {
      const response = await fetch('/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      });
      const result = await response.json();
      // Replace editor content with optimized code
      editor.setValue(result.optimizedCode);
      // Also display it in the output panel
      document.getElementById("output").textContent = result.optimizedCode;
    } catch (error) {
      console.error("Error optimizing code:", error);
      document.getElementById("output").textContent = "Error optimizing code.";
    }
  });
});
