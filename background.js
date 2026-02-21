// Create context menu
browser.contextMenus.create({
  id: "photoroom-remove-bg",
  title: "🖼️ Remove Background with PhotoRoom",
  contexts: ["image"]
});

// Handle download requests from content script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    handleDownload(request.url, request.filename)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async
  }
  
  if (request.action === 'closeTab') {
    // Close the sender tab
    if (sender.tab && sender.tab.id) {
      console.log("PhotoRoom: Closing tab", sender.tab.id);
      browser.tabs.remove(sender.tab.id);
    }
    return false;
  }
  
  if (request.action === 'removeBackground') {
    // Handle button click from image-buttons.js
    handleRemoveBackground(request.imageUrl, sender.tab);
    return false;
  }
  
  if (request.action === 'removeBackgroundFromElement') {
    // Handle button click - use executeScript to get proper image URL like context menu
    handleRemoveBackgroundFromElement(request.imageSrc, sender.tab);
    return false;
  }
  
  if (request.action === 'getHighResImage') {
    // Return the latest captured high-resolution image URL
    sendResponse({ 
      highResUrl: latestHighResImageUrl,
      timestamp: Date.now()
    });
    return false;
  }
});

// Store latest high-resolution image URL from Google Images
let latestHighResImageUrl = null;

// Intercept image requests on Google Images to capture high-res URLs
browser.webRequest.onCompleted.addListener(
  (details) => {
    // Skip thumbnails and small images
    if (details.url.includes('encrypted-tbn0.gstatic.com')) {
      return;
    }
    
    // Only process successful image requests
    if (details.statusCode !== 200) {
      return;
    }
    
    // Check content-type header for images
    const contentType = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-type'
    )?.value || '';
    
    if (!contentType.startsWith('image/')) {
      return;
    }
    
    // Check content-length to filter small images (skip if < 50KB)
    const contentLength = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-length'
    )?.value;
    
    if (contentLength && parseInt(contentLength) < 51200) {
      return; // Skip small images (< 50KB)
    }
    
    // Store the high-res URL
    latestHighResImageUrl = details.url;
  },
  {
    urls: ["*://*.google.com/*", "*://*.googleusercontent.com/*"],
    types: ["image"]
  },
  ["responseHeaders"]
);

// Block redirects to app store
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Cancel requests that redirect to app store
    if (details.url.includes('apps.apple.com') || 
        details.url.includes('play.google.com') ||
        details.url.includes('app.adjust.com') ||
        details.url.includes('photoroom.com/app')) {
      console.log("PhotoRoom: Blocking app store redirect:", details.url);
      return { cancel: true };
    }
    return {};
  },
  { 
    urls: ["<all_urls>"],
    types: ["main_frame", "sub_frame"]
  },
  ["blocking"]
);

async function handleDownload(imageUrl, filename) {
  console.log("PhotoRoom: Handling download for", imageUrl.substring(0, 100));
  
  try {
    // For data URLs (base64), download directly
    if (imageUrl.startsWith('data:')) {
      const downloadId = await browser.downloads.download({
        url: imageUrl,
        filename: filename,
        saveAs: false
      });
      console.log("PhotoRoom: Download started with ID", downloadId);
      return { downloadId, method: 'data-url' };
    }
    
    // For blob URLs, we can't fetch them from background script
    // Let the content script handle it
    if (imageUrl.startsWith('blob:')) {
      console.log("PhotoRoom: Blob URL detected, delegating to content script");
      return { method: 'blob-delegated', message: 'Content script will handle blob URL' };
    }
    
    // For regular HTTP(S) URLs, try to fetch and download
    try {
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      const reader = new FileReader();
      
      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const dataUrl = reader.result;
          browser.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false
          }).then(downloadId => {
            console.log("PhotoRoom: Download started with ID", downloadId);
            resolve({ downloadId, method: 'fetched-blob' });
          }).catch(reject);
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
    } catch (fetchError) {
      console.log("PhotoRoom: Fetch failed, trying direct download", fetchError.message);
      // Fallback: try to download the URL directly
      const downloadId = await browser.downloads.download({
        url: imageUrl,
        filename: filename,
        saveAs: false
      });
      return { downloadId, method: 'direct-url' };
    }
  } catch (error) {
    console.error("PhotoRoom: Download error", error);
    throw error;
  }
}

// Store the image URL for content script to use
let pendingImageUrl = null;

// Handle click
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "photoroom-remove-bg") {
    const imageUrl = info.srcUrl;
    pendingImageUrl = imageUrl;
    
    console.log("PhotoRoom: Starting process for", imageUrl);
    
    try {
      // First, open PhotoRoom immediately so user sees something happening
      const newTab = await browser.tabs.create({
        url: "https://www.photoroom.com/tools/background-remover",
        active: true
      });
      
      // Store the tab ID for later use
      const photoroomTabId = newTab.id;
      
      console.log("PhotoRoom: Tab opened", newTab.id);
      
      // Try to fetch image and prepare for upload immediately
      try {
        const results = await browser.tabs.executeScript(tab.id, {
          code: `
            (async () => {
              try {
                const response = await fetch('${imageUrl}', {mode: 'no-cors'});
                const blob = await response.blob();
                return await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
              } catch (e) {
                return {error: e.message};
              }
            })()
          `
        });
        
        console.log("PhotoRoom: Fetch result", results);
        
        if (results && results[0] && !results[0].error) {
          const base64data = results[0];
          
          // Store the image data for manual upload
          await browser.tabs.executeScript(newTab.id, {
            code: `
              window.photoroomImageData = '${base64data}';
              console.log('PhotoRoom: Image data stored for upload');
            `
          });
          
          // Wait for page to be ready (reduced delay)
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Try automated upload first, if CAPTCHA appears, user can retry manually
          await browser.tabs.executeScript(newTab.id, {
            code: `
              (async function() {
                try {
                  const imageData = window.photoroomImageData;
                  if (!imageData) {
                    console.log('PhotoRoom: No image data available');
                    return;
                  }
                  
                  console.log('PhotoRoom: Starting quick upload...');
                  
                  // Convert base64 to file
                  const byteString = atob(imageData.split(',')[1]);
                  const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                  const ab = new ArrayBuffer(byteString.length);
                  const ia = new Uint8Array(ab);
                  for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                  }
                  const blob = new Blob([ab], {type: mimeString});
                  const file = new File([blob], "image.png", {type: mimeString});
                  
                  // Find file input
                  const fileInput = document.querySelector('input[type="file"]');
                  
                  if (fileInput) {
                    console.log('PhotoRoom: Found file input, uploading...');
                    
                    // Quick upload - minimal delay
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    console.log('PhotoRoom: Upload triggered');
                  } else {
                    console.log('PhotoRoom: File input not found');
                  }
                } catch (e) {
                  console.error('PhotoRoom upload error:', e);
                }
              })();
            `
          });
        } else {
          throw new Error("Could not fetch image");
        }
      } catch (fetchError) {
        console.log("PhotoRoom: Fetch failed, using fallback", fetchError);
        // Fallback: Just open the page and show message
        await browser.tabs.executeScript(newTab.id, {
          code: `
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff9800;color:white;padding:15px;border-radius:5px;z-index:99999;font-family:sans-serif;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:300px;';
            div.innerHTML = '⚠️ Auto-upload blocked by captcha. <br>Image URL copied to clipboard: <br><small>${imageUrl.substring(0,50)}...</small><br><br>Please download the image and upload manually.';
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 8000);
            navigator.clipboard.writeText('${imageUrl}');
          `
        });
      }
      
    } catch (error) {
      console.error("PhotoRoom: Main error", error);
      // Last resort fallback
      browser.tabs.create({
        url: "https://www.photoroom.com/tools/background-remover",
        active: true
      });
    }
  }
});

// Handle remove background button click
async function handleRemoveBackground(imageUrl, sourceTab) {
  console.log("PhotoRoom: Remove background requested for", imageUrl.substring(0, 50));
  
  try {
    // Create new tab with PhotoRoom
    const newTab = await browser.tabs.create({
      url: "https://www.photoroom.com/tools/background-remover",
      active: true
    });
    
    // Wait for tab to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fetch the image with cache bypass to get original quality
    try {
      // Add cache-busting parameter and get original quality
      let fetchUrl = imageUrl;
      if (fetchUrl.includes('googleusercontent.com') || fetchUrl.includes('gstatic.com')) {
        // For Google images, try to get original size by removing size parameters
        fetchUrl = fetchUrl.replace(/=s\d+/, '=s0'); // s0 = original size
        fetchUrl = fetchUrl.replace(/=w\d+-h\d+/, '=w0-h0'); // original size
        console.log('PhotoRoom: Modified Google image URL:', fetchUrl.substring(0, 60));
      }
      
      // Fetch with no-cache to ensure fresh download
      const response = await fetch(fetchUrl, {
        cache: 'no-cache',
        headers: {
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        throw new Error('Fetch failed: ' + response.status);
      }
      
      const blob = await response.blob();
      console.log('PhotoRoom: Fetched image size:', blob.size, 'bytes');
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = async function() {
        const base64data = reader.result;
        console.log('PhotoRoom: Converted to base64, length:', base64data.length);
        
        // Store image data in the new tab
        await browser.tabs.executeScript(newTab.id, {
          code: `
            window.photoroomImageData = '${base64data}';
            console.log('PhotoRoom: Image data stored, size:', ${base64data.length});
          `
        });
        
        // Wait and try upload
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        await browser.tabs.executeScript(newTab.id, {
          code: `
            (async function() {
              try {
                const imageData = window.photoroomImageData;
                if (!imageData) return;
                
                const byteString = atob(imageData.split(',')[1]);
                const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                  ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], {type: mimeString});
                const file = new File([blob], "image.png", {type: mimeString});
                
                console.log('PhotoRoom: Uploading file, size:', file.size, 'bytes');
                
                const fileInput = document.querySelector('input[type="file"]');
                if (fileInput) {
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  fileInput.files = dataTransfer.files;
                  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                  console.log('PhotoRoom: Upload triggered');
                }
              } catch (e) {
                console.error('PhotoRoom upload error:', e);
              }
            })();
          `
        });
      };
    } catch (fetchError) {
      console.log("PhotoRoom: Fetch failed", fetchError);
    }
  } catch (error) {
    console.error("PhotoRoom: Error", error);
  }
}

// Handle remove background from element (button click) - uses same approach as context menu
async function handleRemoveBackgroundFromElement(imageSrc, sourceTab) {
  console.log("PhotoRoom: Button clicked, finding image element");
  
  try {
    // Use executeScript to find the image element and get its proper URL
    const results = await browser.tabs.executeScript(sourceTab.id, {
      code: `
        (function() {
          // Find the image with matching src
          const images = document.querySelectorAll('img');
          for (let img of images) {
            if (img.src === '${imageSrc}' || img.currentSrc === '${imageSrc}') {
              // Return all possible URLs for this image
              return {
                src: img.src,
                currentSrc: img.currentSrc,
                dataset: Object.assign({}, img.dataset),
                parentHref: img.closest('a') ? img.closest('a').href : null
              };
            }
          }
          return null;
        })();
      `
    });
    
    if (!results || !results[0]) {
      console.log("PhotoRoom: Could not find image element");
      return;
    }
    
    const imgInfo = results[0];
    console.log("PhotoRoom: Found image info", imgInfo);
    
    // Try to get the best quality URL
    let bestUrl = imgInfo.currentSrc || imgInfo.src;
    
    // Check if parent link has better quality image
    if (imgInfo.parentHref && !imgInfo.parentHref.includes('google')) {
      if (imgInfo.parentHref.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)) {
        bestUrl = imgInfo.parentHref;
        console.log("PhotoRoom: Using parent link URL");
      }
    }
    
    // Check data attributes for original URL (common in lazy loading)
    for (let key in imgInfo.dataset) {
      const val = imgInfo.dataset[key];
      if (val && val.includes('http') && val.length > bestUrl.length) {
        bestUrl = val;
        console.log("PhotoRoom: Using data attribute URL:", key);
      }
    }
    
    console.log("PhotoRoom: Best URL found:", bestUrl.substring(0, 60));
    
    // Now use the existing handleRemoveBackground with the best URL
    await handleRemoveBackground(bestUrl, sourceTab);
    
  } catch (error) {
    console.error("PhotoRoom: Error finding image element", error);
    // Fallback to original URL
    await handleRemoveBackground(imageSrc, sourceTab);
  }
}