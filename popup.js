// Handle popup button clicks

document.getElementById('firstImage').addEventListener('click', async () => {
  showStatus('Looking for images...', 'info');
  
  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    // Execute script to find and click the first large image
    const results = await browser.tabs.executeScript(activeTab.id, {
      code: `
        (function() {
          const images = document.querySelectorAll('img');
          let bestImage = null;
          let bestSize = 0;
          
          for (let img of images) {
            const rect = img.getBoundingClientRect();
            const size = rect.width * rect.height;
            // Skip tiny images (icons, thumbnails)
            if (rect.width > 100 && rect.height > 100 && size > bestSize) {
              bestSize = size;
              bestImage = img;
            }
          }
          
          if (bestImage) {
            // Simulate right-click on the image
            const event = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2
            });
            bestImage.dispatchEvent(event);
            return { found: true, src: bestImage.src.substring(0, 50) };
          } else {
            return { found: false, error: 'No suitable images found' };
          }
        })();
      `
    });
    
    if (results && results[0]) {
      if (results[0].found) {
        showStatus('Image found! Now right-click it and select "Remove Background with PhotoRoom"', 'success');
      } else {
        showStatus('No suitable images found on this page', 'error');
      }
    }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }
});

document.getElementById('allImages').addEventListener('click', async () => {
  showStatus('Scanning page for images...', 'info');
  
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    // Execute script to highlight all images
    await browser.tabs.executeScript(activeTab.id, {
      code: `
        (function() {
          // Remove existing highlights
          document.querySelectorAll('.photoroom-highlight').forEach(el => {
            el.style.outline = '';
            el.classList.remove('photoroom-highlight');
          });
          
          const images = document.querySelectorAll('img');
          let count = 0;
          
          images.forEach((img, index) => {
            const rect = img.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
              // Add highlight border
              img.style.outline = '3px solid #4CAF50';
              img.style.outlineOffset = '2px';
              img.classList.add('photoroom-highlight');
              
              // Add number badge
              const badge = document.createElement('div');
              badge.textContent = (index + 1);
              badge.style.cssText = 'position:absolute;background:#4CAF50;color:white;padding:2px 6px;border-radius:3px;font-size:12px;z-index:99999;';
              badge.style.top = (rect.top + window.scrollY) + 'px';
              badge.style.left = (rect.left + window.scrollX) + 'px';
              badge.className = 'photoroom-badge';
              document.body.appendChild(badge);
              
              count++;
            }
          });
          
          // Show message
          const msg = document.createElement('div');
          msg.textContent = count + ' images highlighted! Right-click any green-bordered image and select "Remove Background with PhotoRoom"';
          msg.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#4CAF50;color:white;padding:15px 25px;border-radius:5px;z-index:99999;font-family:sans-serif;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
          msg.id = 'photoroom-msg';
          document.body.appendChild(msg);
          
          setTimeout(() => {
            msg.remove();
            document.querySelectorAll('.photoroom-badge').forEach(el => el.remove());
            document.querySelectorAll('.photoroom-highlight').forEach(el => {
              el.style.outline = '';
              el.style.outlineOffset = '';
              el.classList.remove('photoroom-highlight');
            });
          }, 5000);
          
          return { count: count };
        })();
      `
    });
    
    showStatus('Images highlighted with green borders! Right-click any of them.', 'success');
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';
  status.className = type === 'error' ? 'status-error' : (type === 'success' ? 'status-success' : '');
}