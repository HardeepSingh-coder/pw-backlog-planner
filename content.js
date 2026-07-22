// PW Backlog Auto-Sync Content Script

// Helper to parse backlog time strings (e.g. "31h 29m 24s")
function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === "0s") return 0;
  let seconds = 0;
  const hMatch = timeStr.match(/(\d+)\s*h/);
  const mMatch = timeStr.match(/(\d+)\s*m/);
  const sMatch = timeStr.match(/(\d+)\s*s/);
  
  if (hMatch) seconds += parseInt(hMatch[1]) * 3600;
  if (mMatch) seconds += parseInt(mMatch[1]) * 60;
  if (sMatch) seconds += parseInt(sMatch[1]);
  
  return seconds;
}

// Scrape Main Backlog Dashboard
function scrapeDashboard() {
  let results = [];
  
  // Try table rows first (support th and td)
  let tableRows = document.querySelectorAll('table tr, tbody tr');
  if (tableRows.length > 0) {
    tableRows.forEach(row => {
      let cells = Array.from(row.querySelectorAll('td, th'));
      if (cells.length >= 4) {
        let subj = cells[0].innerText.trim();
        let lecs = cells[1].innerText.trim();
        let dpps = cells[2].innerText.trim();
        let watch = cells[3].innerText.trim();
        
        // Ensure it's a valid data row and not a table header row
        if (subj && lecs.includes('/') && !subj.toLowerCase().includes("subject")) {
          results.push({
            subject: subj,
            lectures: lecs,
            dpp: dpps,
            backlog: watch
          });
        }
      }
    });
  }
  
  // Fallback to div-based rows if table didn't produce results
  if (results.length === 0) {
    const rows = Array.from(document.querySelectorAll('div, tr')).filter(el => {
      const text = el.innerText || "";
      return /\d+\/\d+/.test(text) && (text.includes("Ma'am") || text.includes("Sir") || text.includes("English") || text.includes("Notices"));
    });
    
    rows.forEach(row => {
      const text = row.innerText || "";
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const subj = lines[0];
        const lecMatch = text.match(/(\d+\/\d+)/);
        if (lecMatch && !results.some(r => r.subject === subj)) {
          results.push({
            subject: subj,
            lectures: lecMatch[1],
            dpp: "0/0",
            backlog: "0s"
          });
        }
      }
    });
  }
  
  // Clean up results
  results = results.filter(r => r.subject && r.backlog && r.lectures.includes('/'));
  
  if (results.length > 0) {
    // Dynamically search for Aarushi Ma'am's subject page URL to scrape chapters next
    let subjectUrl = null;
    const links = Array.from(document.querySelectorAll('a'));
    const biologyLink = links.find(a => a.href && a.href.includes("biology-by-aarushi"));
    if (biologyLink) {
      subjectUrl = biologyLink.href;
    } else {
      // Look for table cells containing Aarushi / Biology
      const cells = Array.from(document.querySelectorAll('td, div')).filter(el => {
        const t = el.innerText || "";
        return t.toLowerCase().includes("aarushi") && t.toLowerCase().includes("biology");
      });
      if (cells.length > 0) {
        for (let cell of cells) {
          const anchor = cell.querySelector('a') || cell.closest('a');
          if (anchor && anchor.href && anchor.href.includes("/subjects/")) {
            subjectUrl = anchor.href;
            break;
          }
        }
      }
    }

    // Save scraped dashboard data to storage
    chrome.storage.local.set({ 
      pw_backlog_data: results,
      pw_last_sync_time: new Date().toISOString()
    }, () => {
      showSyncIndicator(`Scraped ${results.length} subjects.`);
      console.log("[PW Auto-Sync] Saved backlog list:", results);
      
      // Send signal to background worker that dashboard is ready, forwarding subject URL
      chrome.runtime.sendMessage({ 
        action: "DASHBOARD_SCRAPED", 
        subjectUrl: subjectUrl 
      });
    });
  }
}

// Scrape Biology chapters page to extract Zoology
function scrapeBiologyChapters() {
  let parsedChapters = [];
  
  // Method 1: Target leaf elements containing CH - and Lecture:
  const cardElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const text = el.innerText || "";
    return text.includes("CH -") && text.includes("Lecture:") && el.children.length <= 10;
  });

  const leafCards = cardElements.filter(d => !cardElements.some(other => other !== d && d.contains(other)));

  leafCards.forEach(el => {
    const text = el.innerText || "";
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    let chNum = "";
    let title = "";
    let lectures = "0/0";
    let dpp = "0/0";
    
    lines.forEach(line => {
      if (line.toUpperCase().includes("CH -")) {
        chNum = line;
      } else if (line.includes("Lecture:")) {
        const parts = line.split(/[•|]/);
        parts.forEach(p => {
          if (p.includes("Lecture:")) lectures = p.replace("Lecture:", "").trim();
          if (p.includes("DPP:")) dpp = p.replace("DPP:", "").trim();
        });
      } else if (!title && line.length >= 3) {
        title = line;
      }
    });
    
    if (title && lectures.includes("/")) {
      parsedChapters.push({ chNum, title, lectures, dpp });
    }
  });

  // Method 2: RegEx match across visible page text if element selection missed cards
  if (parsedChapters.length === 0) {
    const pageText = document.body.innerText || "";
    const blocks = pageText.split(/(?=CH\s*-\s*\d+)/i);
    blocks.forEach(block => {
      if (block.includes("Lecture:")) {
        const titleMatch = block.match(/CH\s*-\s*\d+\s*\n+([^\n]+)/i);
        const lecMatch = block.match(/Lecture:\s*(\d+\/\d+)/i);
        const dppMatch = block.match(/DPP:\s*(\d+\/\d+)/i);
        if (lecMatch) {
          parsedChapters.push({
            chNum: "CH",
            title: titleMatch ? titleMatch[1].trim() : "Chapter",
            lectures: lecMatch[1],
            dpp: dppMatch ? dppMatch[1] : "0/0"
          });
        }
      }
    });
  }

  if (parsedChapters.length > 0) {
    // Save scraped chapters to storage
    chrome.storage.local.set({ 
      pw_aarushi_chapters: parsedChapters,
      pw_last_sync_time: new Date().toISOString()
    }, () => {
      const zoologyCount = parsedChapters.filter(ch => ch.title.toLowerCase().includes("(zoology)")).length;
      showSyncIndicator(`Scraped Aarushi Ma'am chapters (${zoologyCount} Zoology).`);
      console.log("[PW Auto-Sync] Saved Aarushi Ma'am chapters:", parsedChapters);
      
      // Notify background worker that chapters scrape is complete
      chrome.runtime.sendMessage({ action: "CHAPTERS_SCRAPED" });
    });
  }
}

// Show a floating visual indicator on the page
function showSyncIndicator(msg) {
  let indicator = document.getElementById("pw-sync-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "pw-sync-indicator";
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(15, 15, 20, 0.9);
      border: 1px solid rgba(139, 92, 246, 0.4);
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3), inset 0 0 10px rgba(139, 92, 246, 0.1);
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 0.85rem;
      font-weight: 600;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
      transform: translateY(100px);
      opacity: 0;
    `;
    document.body.appendChild(indicator);
  }
  
  indicator.innerHTML = `
    <span style="width: 8px; height: 8px; background: #a78bfa; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #a78bfa;"></span>
    PW Auto-Sync: ${msg}
  `;
  
  // Slide in
  setTimeout(() => {
    indicator.style.transform = "translateY(0)";
    indicator.style.opacity = "1";
  }, 100);
  
  // Slide out after 3.5s
  setTimeout(() => {
    indicator.style.transform = "translateY(100px)";
    indicator.style.opacity = "0";
  }, 3500);
}

// Main Flow Control
const currentUrl = window.location.href;

if (window.location.host.includes("pw.live")) {
  console.log("[PW Auto-Sync] Content script injected on Physics Wallah.");
  
  // Instant initial scrape after page load
  const runImmediateScrape = () => {
    if (currentUrl.includes("/study-v2/spd")) {
      scrapeDashboard();
    } else if (currentUrl.includes("biology-by-aarushi")) {
      scrapeBiologyChapters();
    }
  };
  
  setTimeout(runImmediateScrape, 500);
  setTimeout(runImmediateScrape, 1500);
  
  // Observe DOM changes to capture updates dynamically
  const observer = new MutationObserver(() => {
    if (currentUrl.includes("/study-v2/spd")) {
      scrapeDashboard();
    } else if (currentUrl.includes("biology-by-aarushi")) {
      scrapeBiologyChapters();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
} else {
  // We are on the Study Planner page (localhost:8080)!
  console.log("[PW Auto-Sync] Connected to Backlog Planner local tab.");
  
  // Helper to send data to page context
  function syncDataToPage() {
    chrome.storage.local.get(["pw_backlog_data", "pw_aarushi_chapters", "pw_last_sync_time"], (result) => {
      window.postMessage({
        type: "PW_EXTENSION_SYNC",
        data: result.pw_backlog_data || null,
        chapters: result.pw_aarushi_chapters || null,
        syncTime: result.pw_last_sync_time || null
      }, "*");
    });
  }
  
  // Listen for requests from the page context
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "PW_PLANNER_REQUEST_SYNC") {
      syncDataToPage();
    }
    // Listen for manual trigger of background scraper from the page UI
    if (event.data && event.data.type === "PW_TRIGGER_BACKGROUND_SCRAPE") {
      chrome.runtime.sendMessage({ action: "START_SCRAPE_FLOW" });
    }
  });

  // Listen for message from background worker that sync completes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SYNC_COMPLETE") {
      console.log("[PW Auto-Sync] Background sync finished, updating page.");
      syncDataToPage();
    }
  });
  
  // Trigger initial storage read on page load
  setTimeout(syncDataToPage, 500);
}
