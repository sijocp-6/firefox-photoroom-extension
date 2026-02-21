// Add remove background buttons to all images on the page

(function() {
  // Prevent running multiple times
  if (window.photoroomButtonsAdded) return;
  window.photoroomButtonsAdded = true;

  console.log('PhotoRoom: Extension loaded');

  // CSS for the button
  const style = document.createElement('style');
  style.textContent = `
    .photoroom-img-container {
      position: relative !important;
      display: inline-block !important;
    }
    .photoroom-btn {
      position: absolute !important;
      bottom: 5px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: #4CAF50 !important;
      color: white !important;
      border: none !important;
      padding: 6px 12px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      z-index: 9999 !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
      opacity: 0;
      transition: opacity 0.2s, background 0.2s !important;
      pointer-events: auto !important;
    }
    .photoroom-img-container:hover .photoroom-btn {
      opacity: 1;
    }
    .photoroom-btn:hover {
      background: #45a049 !important;
    }
  `;
  document.head.appendChild(style);

  // Simple function to get high-res image from Google Images preview
  async function getGoogleImagesHighRes(imgElement, btn) {
    return new Promise((resolve) => {
      // Click to open preview
      btn.textContent = '⏳ Opening...';
      imgElement.click();
      
      // Wait for preview to open
      setTimeout(() => {
        // Look for ALL large visible images (not just new ones)
        const allImages = document.querySelectorAll('img');
        let bestImage = null;
        let bestWidth = 0;
        
        for (const img of allImages) {
          // Must be visible
          if (img.offsetParent === null) continue;
          
          // Skip thumbnails and Google images
          if (img.src.includes('encrypted-tbn0')) continue;
          if (img.src.includes('gstatic.com')) continue;
          if (img.src.includes('google.com')) continue;
          
          // Must be loaded
          if (!img.complete) continue;
          
          // Check size
          const width = img.naturalWidth || img.width || 0;
          if (width < 600) continue; // Too small
          
          // Pick the largest
          if (width > bestWidth) {
            bestWidth = width;
            bestImage = img;
          }
        }
        
        if (bestImage) {
          console.log('PhotoRoom: Found high-res:', bestImage.src.substring(0, 60));
          resolve(bestImage.currentSrc || bestImage.src);
        } else {
          console.log('PhotoRoom: No high-res found');
          resolve(null);
        }
      }, 500); // Wait 0.5 seconds for preview to open
    });
  }

  function addButtonsToImages() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      // Skip if already processed or too small
      if (img.dataset.photoroomProcessed) return;
      if (img.width < 100 && img.height < 100) return;
      
      const rect = img.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) return;
      
      // Skip if already has a button
      if (img.parentElement && img.parentElement.classList.contains('photoroom-img-container')) return;
      
      // Mark as processed
      img.dataset.photoroomProcessed = 'true';
      
      // Create container
      const container = document.createElement('div');
      container.className = 'photoroom-img-container';
      container.style.cssText = 'position: relative; display: inline-block;';
      
      // Wrap image
      img.parentNode.insertBefore(container, img);
      container.appendChild(img);
      
      // Create button
      const btn = document.createElement('button');
      btn.className = 'photoroom-btn';
      btn.textContent = '🖼️ Remove BG';
      
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Prevent double-click
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        
        try {
          const isGoogleImages = window.location.hostname.includes('google.com') && 
                                 window.location.pathname.includes('/search');
          
          let imageUrl = img.src;
          
          if (isGoogleImages) {
            // Disable link temporarily
            const link = img.closest('a');
            if (link) {
              const href = link.href;
              link.removeAttribute('href');
              setTimeout(() => link.href = href, 200);
            }
            
            // Get high-res from preview
            imageUrl = await getGoogleImagesHighRes(img, btn);
            
            if (!imageUrl) {
              btn.textContent = '❌ Failed';
              btn.style.background = '#f44336';
              setTimeout(() => {
                btn.textContent = '🖼️ Remove BG';
                btn.style.background = '#4CAF50';
                btn.dataset.processing = 'false';
              }, 2000);
              return;
            }
          }
          
          btn.textContent = '⏳ Loading...';
          btn.style.background = '#ff9800';
          
          // Send to background
          await browser.runtime.sendMessage({
            action: 'removeBackground',
            imageUrl: imageUrl
          });
          
          btn.textContent = '✓ Done';
          btn.style.background = '#4CAF50';
          setTimeout(() => {
            btn.textContent = '🖼️ Remove BG';
            btn.dataset.processing = 'false';
          }, 2000);
          
        } catch (err) {
          console.error('PhotoRoom Error:', err);
          btn.textContent = '❌ Error';
          btn.style.background = '#f44336';
          btn.dataset.processing = 'false';
        }
      });
      
      // Prevent default mousedown
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      container.appendChild(btn);
    });
  }

  // Add to existing images
  addButtonsToImages();
  
  // Watch for new images
  const observer = new MutationObserver(() => {
    addButtonsToImages();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('PhotoRoom: Ready');
})();
