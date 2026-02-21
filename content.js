// Content script to help with image fetching and auto-download
console.log("PhotoRoom extension content script loaded");

// Check if we're on PhotoRoom background remover page
if (window.location.href.includes('photoroom.com/tools/background-remover')) {
  console.log("PhotoRoom: On background remover page, starting observer");
  initAutoDownload();
} else if (window.location.href.includes('apps.apple.com') || 
           window.location.href.includes('photoroom.com/app')) {
  console.log("PhotoRoom: Redirected to app store, going back to web version");
  // Show message and redirect back
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ff9800;color:white;padding:20px;border-radius:8px;z-index:99999;font-family:sans-serif;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;';
  div.innerHTML = '<strong>PhotoRoom Extension</strong><br>Redirecting to web version...';
  document.body.appendChild(div);
  
  // Redirect to web version after a short delay
  setTimeout(() => {
    window.location.href = 'https://www.photoroom.com/tools/background-remover';
  }, 1500);
}

function initAutoDownload() {
  let processedImageUrl = null;
  let downloadTriggered = false;
  let checkCount = 0;
  const MAX_CHECKS = 600; // Stop after ~20 minutes
  
  // Listen for messages from background script
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkStatus') {
      sendResponse({
        hasResult: !!processedImageUrl,
        imageUrl: processedImageUrl
      });
    }
    return true;
  });
  
  // Monitor for the result image
  const observer = new MutationObserver((mutations) => {
    checkForResult();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'href', 'class']
  });
  
  // Check frequently for faster response
  const checkInterval = setInterval(() => {
    checkCount++;
    if (checkCount > MAX_CHECKS || downloadTriggered) {
      clearInterval(checkInterval);
      return;
    }
    checkForResult();
  }, 500);
  
  function checkForResult() {
    if (downloadTriggered) return;
    
    console.log("PhotoRoom: Checking for result...", checkCount);
    
    // Check if there's a large image visible first (indicates processing complete)
    const hasLargeImage = Array.from(document.querySelectorAll('img')).some(img => {
      const rect = img.getBoundingClientRect();
      return rect.width > 400 && rect.height > 400;
    });
    
    if (hasLargeImage) {
      console.log("PhotoRoom: Large image detected, checking for download button or downloading directly");
      
      // Look for Download button to confirm processing is done
      const allElements = document.querySelectorAll('*');
      let hasDownloadButton = false;
      
      for (let el of allElements) {
        if (el.textContent?.trim() === 'Download' && el.offsetParent !== null) {
          hasDownloadButton = true;
          console.log("PhotoRoom: Found Download button, processing complete");
          break;
        }
      }
      
      // If we have both large image and download button, processing is complete
      if (hasDownloadButton) {
        console.log("PhotoRoom: Processing complete, downloading result image directly");
        downloadTriggered = true;
        showNotification('📥 Downloading result image...');
        
        // Download the result image directly
        setTimeout(() => {
          downloadResultImage();
        }, 500);
        return;
      }
    }
    
    // Method 2: Check for large images on the page (result is usually large)
    const allImages = document.querySelectorAll('img');
    let largestImage = null;
    let largestArea = 0;
    
    for (let img of allImages) {
      const src = img.src;
      if (!src || !src.startsWith('http')) continue;
      
      // Skip small icons and logos
      const rect = img.getBoundingClientRect();
      const area = rect.width * rect.height;
      
      // Look for images that are likely results (large, from photoroom or blob/data URLs)
      const isResult = 
        (src.includes('photoroom.com') && (src.includes('result') || src.includes('processed') || src.includes('edit') || src.includes('image'))) ||
        src.startsWith('blob:') ||
        (area > 300000 && !src.includes('logo') && !src.includes('icon'));
      
      if (isResult && area > largestArea) {
        largestArea = area;
        largestImage = src;
      }
    }
    
    if (largestImage && largestArea > 300000) {
      console.log("PhotoRoom: Found large result image:", largestImage, "Area:", largestArea);
      
      // If we found a large image but no download button was clicked yet,
      // try to find any clickable element with "Download" text
      const allElements = document.querySelectorAll('button, div, a, span');
      for (let el of allElements) {
        if (el.textContent?.trim() === 'Download' && el.offsetParent !== null) {
          console.log("PhotoRoom: Found Download button by text content");
          if (!downloadTriggered) {
            downloadTriggered = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              el.click();
              showNotification('✓ Download button clicked!');
            }, 500);
            return;
          }
        }
      }
      
      // If still no download button, download the image directly
      if (!downloadTriggered) {
        triggerDownload(largestImage);
        return;
      }
    }
    
    // Method 3: Check for canvas elements
    const canvases = document.querySelectorAll('canvas');
    for (let canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 300 && rect.height > 300) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 10000) {
            console.log("PhotoRoom: Found canvas with image data");
            triggerDownload(dataUrl);
            return;
          }
        } catch (e) {
          // Canvas might be tainted
        }
      }
    }
  }
  
  function clickStandardResolution() {
    console.log("PhotoRoom: Looking for Standard resolution option...");
    
    // Method 1: Look for the specific div containing "Standard resolution" text
    const allDivs = document.querySelectorAll('div');
    for (let div of allDivs) {
      // Check if this div has exactly "Standard resolution" as text content
      if (div.textContent?.trim() === 'Standard resolution' && div.children.length === 0) {
        console.log("PhotoRoom: Found Standard resolution div, looking for clickable parent...");
        
        // Find the clickable parent (button or role="menuitem")
        let clickableParent = div.closest('button') || 
                             div.closest('[role="menuitem"]') || 
                             div.closest('[class*="component-500"]') ||
                             div.parentElement?.parentElement;
        
        if (clickableParent) {
          console.log("PhotoRoom: Clicking Standard resolution parent element");
          
          // Click immediately
          clickableParent.click();
          div.click();
          
          showNotification('✓ Standard resolution selected! Downloading...');
          
          // Also try to find and download the result image directly
          setTimeout(() => {
            downloadResultImage();
          }, 1000);
          return;
        }
      }
    }
    
    // Method 2: Look for any element containing "Standard resolution" text
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
      const text = el.childNodes[0]?.textContent?.trim() || el.textContent?.trim() || '';
      
      if (text === 'Standard resolution' && el.offsetParent !== null) {
        console.log("PhotoRoom: Found Standard resolution element, clicking...");
        
        // Find clickable ancestor
        let target = el;
        while (target && target.tagName !== 'BUTTON' && target.getAttribute('role') !== 'menuitem') {
          target = target.parentElement;
          if (!target || target.tagName === 'BODY') break;
        }
        
        if (target && target !== document.body) {
          target.click();
          showNotification('✓ Standard resolution selected! Downloading...');
          return;
        }
      }
    }
    
    // Method 3: Look by partial text match
    for (let el of allElements) {
      const text = el.textContent?.toLowerCase().trim() || '';
      if (text.includes('standard') && text.includes('resolution') && el.offsetParent !== null) {
        // Find the most specific element (leaf node)
        if (el.children.length === 0) {
          console.log("PhotoRoom: Found Standard resolution by partial match");
          
          let target = el.closest('button, [role="menuitem"]') || el.parentElement;
          if (target) {
            target.click();
            showNotification('✓ Standard resolution selected! Downloading...');
            return;
          }
        }
      }
    }
    
    console.log("PhotoRoom: Standard resolution option not found");
  }
  
  function downloadResultImage() {
    console.log("PhotoRoom: Trying to download result image...");
    
    // Method 1: Look for image with alt text "Image with background removed"
    const allImages = document.querySelectorAll('img');
    for (let img of allImages) {
      const alt = img.getAttribute('alt') || '';
      if (alt.toLowerCase().includes('background removed') || alt.toLowerCase().includes('removed')) {
        console.log("PhotoRoom: Found image by alt text:", alt, img.src.substring(0, 60));
        if (img.src && img.src.length > 100) {
          downloadDataUrlImage(img.src);
          return;
        }
      }
    }
    
    // Method 2: Look for data:image/png URLs that are large (the result)
    for (let img of allImages) {
      const src = img.src || '';
      if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg')) {
        const rect = img.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 300) {
          console.log("PhotoRoom: Found data URL image:", src.substring(0, 60), "Size:", rect.width, "x", rect.height);
          downloadDataUrlImage(src);
          return;
        }
      }
    }
    
    // Method 3: Look for blob URLs
    for (let img of allImages) {
      const src = img.src || '';
      if (src.startsWith('blob:')) {
        const rect = img.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 300) {
          console.log("PhotoRoom: Found blob URL:", src.substring(0, 50));
          downloadImageWithCanvas(img);
          return;
        }
      }
    }
    
    console.log("PhotoRoom: Could not find result image");
    showNotification('❌ Download failed - please download manually');
  }
  
  function downloadDataUrlImage(dataUrl) {
    console.log("PhotoRoom: Downloading data URL image...");
    
    // Convert base64 to blob and download
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'photoroom-result-' + Date.now() + '.png';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("PhotoRoom: Data URL download complete");
        // Close the tab quickly
        setTimeout(() => {
          browser.runtime.sendMessage({ action: 'closeTab' });
        }, 500);
      })
      .catch(err => {
        console.error("PhotoRoom: Data URL download failed:", err);
        // Fallback: direct download
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'photoroom-result-' + Date.now() + '.png';
        a.click();
        // Close the tab quickly
        setTimeout(() => {
          browser.runtime.sendMessage({ action: 'closeTab' });
        }, 500);
      });
  }
  
  function downloadImageWithCanvas(img) {
    console.log("PhotoRoom: Starting canvas download...");
    
    // Create a new image element to ensure it's loaded
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';
    
    tempImg.onload = function() {
      console.log("PhotoRoom: Image loaded, natural size:", tempImg.naturalWidth, "x", tempImg.naturalHeight);
      
      try {
        const canvas = document.createElement('canvas');
        canvas.width = tempImg.naturalWidth;
        canvas.height = tempImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        
        // Fill with white background first (in case of transparent PNG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the image
        ctx.drawImage(tempImg, 0, 0);
        
        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (blob && blob.size > 1000) { // Make sure blob is not empty
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'photoroom-result-' + Date.now() + '.png';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log("PhotoRoom: Download triggered, blob size:", blob.size);
            // Close the tab quickly
            setTimeout(() => {
              browser.runtime.sendMessage({ action: 'closeTab' });
            }, 500);
          } else {
            console.error("PhotoRoom: Canvas blob is empty or too small:", blob?.size);
            fallbackDownload(img.src);
          }
        }, 'image/png');
      } catch (e) {
        console.error("PhotoRoom: Canvas extraction failed:", e);
        fallbackDownload(img.src);
      }
    };
    
    tempImg.onerror = function() {
      console.error("PhotoRoom: Failed to load image for canvas");
      fallbackDownload(img.src);
    };
    
    // Set src after setting up handlers
    tempImg.src = img.src;
  }
  
  function triggerDownload(imageUrl) {
    if (downloadTriggered) return;
    downloadTriggered = true;
    clearInterval(checkInterval);
    
    console.log("PhotoRoom: Triggering download for", imageUrl);
    showNotification('📥 Starting download...');
    
    // Send message to background script to handle download
    browser.runtime.sendMessage({
      action: 'downloadImage',
      url: imageUrl,
      filename: 'photoroom-result-' + Date.now() + '.png'
    }).then(response => {
      console.log("PhotoRoom: Download response", response);
      if (response && response.success) {
        // Close the tab quickly
        setTimeout(() => {
          browser.runtime.sendMessage({ action: 'closeTab' });
        }, 500);
      } else {
        showNotification('⚠️ Download issue, trying fallback...');
        fallbackDownload(imageUrl);
      }
    }).catch(err => {
      console.error("PhotoRoom: Download failed", err);
      fallbackDownload(imageUrl);
    });
  }
  
  function fallbackDownload(imageUrl) {
    console.log("PhotoRoom: Using fallback download");
    
    // For blob URLs, we need to fetch them first
    if (imageUrl.startsWith('blob:')) {
      fetch(imageUrl)
        .then(response => response.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'photoroom-result-' + Date.now() + '.png';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          // Close the tab quickly
          setTimeout(() => {
            browser.runtime.sendMessage({ action: 'closeTab' });
          }, 500);
        })
        .catch(err => {
          console.error("PhotoRoom: Fallback failed", err);
          showNotification('❌ Download failed. Please download manually.');
        });
    } else {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = 'photoroom-result-' + Date.now() + '.png';
      a.target = '_blank';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Close the tab quickly
      setTimeout(() => {
        browser.runtime.sendMessage({ action: 'closeTab' });
      }, 500);
    }
  }
  
  function showNotification(message) {
    // Remove existing notifications
    const existing = document.querySelector('.photoroom-notification');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.className = 'photoroom-notification';
    div.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:15px 25px;border-radius:8px;z-index:99999;font-family:sans-serif;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;max-width:350px;word-wrap:break-word;';
    div.innerHTML = '<strong>PhotoRoom Extension</strong><br>' + message;
    document.body.appendChild(div);
    
    if (!message.includes('...')) {
      setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => div.remove(), 300);
      }, 5000);
    }
  }
  
  // Add animation styles
  if (!document.getElementById('photoroom-styles')) {
    const style = document.createElement('style');
    style.id = 'photoroom-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}