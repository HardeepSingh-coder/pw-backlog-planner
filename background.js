// PW Auto-Sync Background Service Worker

let dashboardTabId = null;
let chaptersTabId = null;
let dashboardTimeout = null;
let chaptersTimeout = null;

// Track if background scrape flow was explicitly triggered by user clicking Sync Now
let isScrapeFlowActive = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_SCRAPE_FLOW") {
    console.log("[PW Service Worker] Starting background scrape flow...");
    isScrapeFlowActive = true;
    if (typeof sendResponse === "function") sendResponse({ status: "started" });
    
    // Clear any previous timeouts
    if (dashboardTimeout) clearTimeout(dashboardTimeout);
    if (chaptersTimeout) clearTimeout(chaptersTimeout);
    
    // Close any stale tabs
    if (dashboardTabId) {
      chrome.tabs.remove(dashboardTabId).catch(() => {});
      dashboardTabId = null;
    }
    if (chaptersTabId) {
      chrome.tabs.remove(chaptersTabId).catch(() => {});
      chaptersTabId = null;
    }

    // 1. Open dashboard tab in background
    chrome.tabs.create({ url: "https://www.pw.live/study-v2/spd", active: false }, (tab) => {
      dashboardTabId = tab.id;
      
      // Auto-close safety limit: 6.5 seconds
      dashboardTimeout = setTimeout(() => {
        if (dashboardTabId) {
          console.log("[PW Service Worker] Dashboard tab safety auto-close.");
          chrome.tabs.remove(dashboardTabId).catch(() => {});
          dashboardTabId = null;
        }
      }, 6500);
    });
  }
  
  if (message.action === "DASHBOARD_SCRAPED") {
    console.log("[PW Service Worker] Dashboard scraped.");
    if (typeof sendResponse === "function") sendResponse({ status: "dashboard_received" });

    // ONLY open next tab if automated background scrape flow is active!
    if (isScrapeFlowActive) {
      if (dashboardTimeout) clearTimeout(dashboardTimeout);
      if (dashboardTabId) {
        chrome.tabs.remove(dashboardTabId).catch(() => {});
        dashboardTabId = null;
      }
      
      let subjectUrl = message.subjectUrl || "https://www.pw.live/study-v2/batches/uday-2027--class-11th--651278/subjects/biology-by-aarushi-mam-694582/chapters";
      
      console.log("[PW Service Worker] Opening subject page in background:", subjectUrl);
      chrome.tabs.create({ url: subjectUrl, active: false }, (tab) => {
        chaptersTabId = tab.id;
        
        chaptersTimeout = setTimeout(() => {
          if (chaptersTabId) {
            console.log("[PW Service Worker] Chapters tab safety auto-close.");
            chrome.tabs.remove(chaptersTabId).catch(() => {});
            chaptersTabId = null;
            isScrapeFlowActive = false;
          }
        }, 6500);
      });
    }
  }
  
  if (message.action === "CHAPTERS_SCRAPED") {
    console.log("[PW Service Worker] Chapters scraped.");
    if (typeof sendResponse === "function") sendResponse({ status: "chapters_received" });

    if (isScrapeFlowActive) {
      isScrapeFlowActive = false;
      if (chaptersTimeout) clearTimeout(chaptersTimeout);
      if (chaptersTabId) {
        chrome.tabs.remove(chaptersTabId).catch(() => {});
        chaptersTabId = null;
      }
    }
    
    // Notify all planner tabs that sync is complete
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) return;
      tabs.forEach(tab => {
        if (tab && tab.id && tab.url && (tab.url.includes("localhost:8080") || tab.url.includes("127.0.0.1:8080") || tab.url.includes("vercel.app"))) {
          chrome.tabs.sendMessage(tab.id, { action: "SYNC_COMPLETE" }, () => {
            if (chrome.runtime.lastError) {}
          });
        }
      });
    });
  }
  return true;
});
