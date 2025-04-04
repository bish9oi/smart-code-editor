document.getElementById("submit-code").addEventListener("click", async function() {
    const code = document.getElementById("chatbot-code").value;
    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const result = await response.json();
      document.getElementById("chatbot-output").textContent = result.response;
    } catch (error) {
      console.error("Error in chatbot:", error);
      document.getElementById("chatbot-output").textContent = "Error processing your code.";
    }
  });
