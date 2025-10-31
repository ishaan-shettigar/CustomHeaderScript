/**
 * Swym Wishlist Icon Injector (Proof of Concept)
 *
 * This script handles the theme-agnostic injection of a wishlist heart icon
 * into a merchant's header by cloning an existing icon's structure.
 *
 * This version removes the MutationObserver for simple, direct execution.
 */

class WishlistInjectorPOC {
  /**
   * Your new heart icon SVG string.
   * Use 'currentColor' for fill/stroke to inherit the theme's icon color.
   */
  heartIconSVGString = `
    <svg xmlns="http://www.w3.org/2000/svg" 
         viewBox="0 0 24 24" 
         fill="none"
         stroke="currentColor"
         stroke-linecap="round" 
         stroke-linejoin="round"
         aria-hidden="true"
         focusable="false"
         role="presentation">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  `;
  // Note: Per request, stroke properties are removed to rely on CSS inheritance.

  /**
   * A unique ID for the injected wishlist button to prevent duplicates.
   */
  wishlistButtonId = 'swym-wishlist-header-button';

  /**
   * The URL for the wishlist page.
   */
  wishlistPageUrl = '/apps/wishlist'; // Or your app's URL

  /**
   * The aria-label for accessibility.
   */
  wishlistAriaLabel = 'Wishlist (0 items)'; // Will need to be dynamic

  /**
   * Creates the heart SVG element from the string.
   * @param {Element | null} referenceIcon - The icon (svg, i, img) to reference for classes AND dimensions.
   * @returns {Element | null} - The new SVG element.
   */
  createHeartSvg(referenceIcon) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.heartIconSVGString;
    const newSvg = tempDiv.firstElementChild;

    if (!newSvg) {
      console.error('Swym: Heart SVG string is invalid.');
      return null;
    }

    if (referenceIcon) {
      // 1. Copy all classes. This is great for layout, margins, etc.
      newSvg.setAttribute('class', referenceIcon.getAttribute('class'));

      // 2. We no longer copy dimensions here.
      // The new _matchIconScale method handles this after injection,
      // which is more accurate as it scales the <path> itself.
    }

    return newSvg;
  }

  /**
   * Helper function to get detailed info about an element for scaling.
   * @param {Element} el - The element (usually a <path>)
   * @returns {object | null}
   */
  _getIconInfo(el) {
    if (!el) return null;
    const svg = el.ownerSVGElement || el.closest('svg');
    const bbox = (() => { try { return el.getBBox(); } catch (e) { return null; } })();
    const rect = (() => { try { return el.getBoundingClientRect(); } catch (e) { return null; } })();
    const cstyle = (() => { try { return window.getComputedStyle(el); } catch (e) { return null; } })();
    const transformAttr = el.getAttribute('transform');
    const svgViewBox = svg ? svg.getAttribute('viewBox') : null;
    const svgRect = svg ? svg.getBoundingClientRect() : null;
    const svgSizeAttrs = svg ? { width: svg.getAttribute('width'), height: svg.getAttribute('height') } : null;
    return { el, svg, bbox, rect, cstyle, transformAttr, svgViewBox, svgRect, svgSizeAttrs };
  }

  /**
   * Scales the heart icon's path to match the reference icon's path.
   * This is called *after* the heart icon is injected into the DOM.
   * @param {Element} referenceIcon - The original cart icon element (svg, i, img)
   * @param {Element} heartSvg - The newly injected heart <svg> element
   * @param {number} maxScaleDecimals - Rounding for the applied scale
   */
  _matchIconScale(referenceIcon, heartSvg, maxScaleDecimals = 3) {
    if (!referenceIcon || !heartSvg) {
      console.warn('Swym Scaler: Missing reference or heart icon. Skipping scaling.');
      return;
    }
    
    // The scaler logic is path-based. Find the <path> in each icon.
    // This assumes the reference icon is also an SVG with a path.
    const refEl = referenceIcon.querySelector('path');
    const heartEl = heartSvg.querySelector('path'); // Heart is always our SVG, so this is safe.

    if (!refEl) {
      console.warn('Swym Scaler: No <path> found in reference icon. Cannot apply path-based scaling.');
      return; 
    }
    if (!heartEl) {
      console.warn('Swym Scaler: No <path> found in new heart icon. Cannot scale.');
      return;
    }

    const ref = this._getIconInfo(refEl);
    const heart = this._getIconInfo(heartEl);
    
    // determine rendered widths/heights (px). prefer boundingClientRect which includes stroke & CSS transforms
    const refWidthPx = ref.rect && ref.rect.width ? ref.rect.width : (ref.bbox ? ref.bbox.width : null);
    const refHeightPx = ref.rect && ref.rect.height ? ref.rect.height : (ref.bbox ? ref.bbox.height : null);
    const heartWidthPx = heart.rect && heart.rect.width ? heart.rect.width : (heart.bbox ? heart.bbox.width : null);
    const heartHeightPx = heart.rect && heart.rect.height ? heart.rect.height : (heart.bbox ? heart.bbox.height : null);

    if (!refWidthPx || !heartWidthPx || !refHeightPx || !heartHeightPx) {
      console.warn('Swym Scaler: Could not determine widths/heights for scaling. Check getBoundingClientRect/getBBox.');
      return;
    }

    // desired (visual) scale to match reference
    const desiredScaleX = refWidthPx / heartWidthPx;
    const desiredScaleY = refHeightPx / heartHeightPx;
    // Use Math.max to ensure the heart path is at least as large as the reference in both dimensions
    const desiredScale = Math.max(desiredScaleX, desiredScaleY); 

    // compute stroke contribution in px on the heart path
    // get computed stroke-width (should be in px from getComputedStyle)
    let strokeWidthPx = 1;
    let vectorEffect = null;
    try {
      if (heart.cstyle) {
        const sw = heart.cstyle.getPropertyValue('stroke-width') || '';
        // getComputedStyle may return values like '1.5px' — parse float
        const parsed = parseFloat(sw);
        strokeWidthPx = Number.isFinite(parsed) ? parsed : 1;
        vectorEffect = (heart.cstyle.getPropertyValue('vector-effect') || '').trim();
      }
    } catch (e) { /* ignore */ }


    // Now compute a clamp so we don't exceed the heart's own SVG visible box.
    let clampScale = desiredScale;

    if (heart.svgRect && heart.svgRect.width && heart.svgRect.height) {
      // If stroke scales with the path (normal), scaled element total width = s*(pathWidth) + s*(strokeWidth)
      // => s * (pathWidth + strokeWidth) <= svgBoxWidth  => s <= svgBoxWidth / (pathWidth + strokeWidth)
      //
      // If vector-effect: non-scaling-stroke, strokeWidth does NOT scale:
      // => s * pathWidth + strokeWidth <= svgBoxWidth  => s <= (svgBoxWidth - strokeWidth) / pathWidth

      const svgBoxW = heart.svgRect.width;
      const svgBoxH = heart.svgRect.height;

      // width-based max
      let maxScaleByWidth;
      if (vectorEffect && vectorEffect.indexOf('non-scaling-stroke') !== -1) {
        // stroke does not scale
        maxScaleByWidth = (svgBoxW - strokeWidthPx) / heartWidthPx;
      } else {
        // stroke scales with the path
        maxScaleByWidth = svgBoxW / (heartWidthPx + strokeWidthPx);
      }

      // height-based max (same logic)
      let maxScaleByHeight;
      if (vectorEffect && vectorEffect.indexOf('non-scaling-stroke') !== -1) {
        maxScaleByHeight = (svgBoxH - strokeWidthPx) / heartHeightPx;
      } else {
        maxScaleByHeight = svgBoxH / (heartHeightPx + strokeWidthPx);
      }

      // make sure these numbers are reasonable
      if (!(isFinite(maxScaleByWidth) && maxScaleByWidth > 0)) maxScaleByWidth = desiredScale;
      if (!(isFinite(maxScaleByHeight) && maxScaleByHeight > 0)) maxScaleByHeight = desiredScale;

      const maxAllowedScale = Math.min(maxScaleByWidth, maxScaleByHeight);

      clampScale = Math.min(desiredScale, maxAllowedScale);
    }

    // final rounding
    const pow = Math.pow(10, maxScaleDecimals || 3);
    const finalScale = Math.round(clampScale * pow) / pow;

    // pick center in SVG user units (prefer viewBox center)
    const svg = heart.svg;
    if (!svg) return console.warn('Swym Scaler: Heart svg not found.');
    let cx = 12, cy = 12; // defaults for 24x24
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const parts = vb.split(/\s+|,/).map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [minx, miny, w, h] = parts;
        cx = minx + w / 2;
        cy = miny + h / 2;
      }
    } else if (heart.bbox) {
      cx = heart.bbox.x + heart.bbox.width / 2;
      cy = heart.bbox.y + heart.bbox.height / 2;
    }

    // apply centered transform (prepend to preserve existing transforms applied afterwards)
    const existing = heartEl.getAttribute('transform') || '';
    const newTransform = `translate(${cx} ${cy}) scale(${finalScale}) translate(${-cx} ${-cy})`;
    heartEl.setAttribute('transform', newTransform + (existing ? ' ' + existing : ''));

    console.log('Swym Scaler: Heart icon scaled.', { ref, heart, finalScale, appliedTransform: newTransform });
  }

  /**
   * The core injection logic.
   * @param {string} cartSelector - The CSS selector for the cart element.
   */
  inject(cartSelector) {
    if (!cartSelector) {
      console.error('Swym: No cart selector provided.');
      return;
    }

    try {
      // 1. Find the anchor (cart) element
      const cartElement = document.querySelector(cartSelector);
      if (!cartElement) {
        console.error(`Swym: Could not find element with selector: ${cartSelector}`);
        return;
      }

      // 2. Check if our icon is already injected
      if (document.getElementById(this.wishlistButtonId)) {
        console.log('Swym: Wishlist icon already present.');
        return;
      }

      // 3. Clone the cart element (deep clone) - This is the core strategy
      const wishlistElement = cartElement.cloneNode(true);

      // 4. Modify the clone
      wishlistElement.setAttribute('id', this.wishlistButtonId);
      
      // FIX 1: Remove any cart-specific classes (e.g., "header__icon--cart")
      if (wishlistElement.classList) {
        const classesToRemove = [];
        wishlistElement.classList.forEach(className => {
          if (className.toLowerCase().includes('cart')) {
            classesToRemove.push(className);
          }
        });
        wishlistElement.classList.remove(...classesToRemove);
      }
      
      // Remove any cart-specific IDs or data attributes
      wishlistElement.querySelectorAll('[id*="cart"]').forEach(el => el.removeAttribute('id'));
      wishlistElement.querySelectorAll('[data-cart-status]').forEach(el => el.removeAttribute('data-cart-status'));
      
      // --- Handle Click Behavior (Point 3) ---
      
      // Remove cart-specific hrefs
      if (wishlistElement.matches('a[href*="/cart"]')) {
          wishlistElement.removeAttribute('href');
      }
      wishlistElement.querySelectorAll('a[href*="/cart"]').forEach(el => el.removeAttribute('href'));

      // Add our wishlist functionality
      if (wishlistElement.tagName === 'A') {
        // If the main element is a link, set its href
        wishlistElement.setAttribute('href', this.wishlistPageUrl);
      } else {
        // If it's a <button> or <div>, add an onclick handler.
        // This will override any cloned click listeners.
        wishlistElement.style.cursor = 'pointer';
        wishlistElement.onclick = (e) => {
          e.preventDefault(); // Stop any original cloned behavior
          e.stopPropagation(); // Stop any original cloned behavior
          window.location.href = this.wishlistPageUrl;
        };
      }
      
      wishlistElement.setAttribute('aria-label', this.wishlistAriaLabel);

      // 5. Find and replace the icon *inside* the clone (Point 4)
      // This is more robust than just assuming SVG.
      const iconSelector = 'svg, i[class*="icon"], i[class*="fa-"], img';
      const originalIcon = wishlistElement.querySelector(iconSelector);
      const referenceIcon = cartElement.querySelector(iconSelector); // The original cart icon
      
      let heartSvg; // We need to reference this later

      if (originalIcon && referenceIcon) {
        heartSvg = this.createHeartSvg(referenceIcon);
        if (heartSvg) {
          originalIcon.parentElement.replaceChild(heartSvg, originalIcon);
        }
      } else {
        console.warn('Swym: Could not find an icon (svg, i, img) inside the cloned cart element.');
        
        // FIX 2: Fallback logic changed. Do not size to cartElement.
        // Create a default heart (no dimensions) and append it.
        heartSvg = this.createHeartSvg(null); 
        if (heartSvg) {
          wishlistElement.appendChild(heartSvg);

        }
      }

      // 6. Insert the new wishlist element before the cart element
      cartElement.parentElement.insertBefore(wishlistElement, cartElement);
      console.log('Swym: Wishlist icon injected successfully.');

      // 7. NEW STEP: Scale the icon now that it's in the DOM and visible
      if (referenceIcon && heartSvg) {
        // This will find the <path> elements inside each and scale the heart's path
        // to match the cart's path.
        this._matchIconScale(referenceIcon, heartSvg);
      } else {
        console.warn('Swym Scaler: Could not scale icon, missing referenceIcon or heartSvg.');
      }

    } catch (error) {
      console.error('Swym: Error injecting wishlist icon:', error);
    }
  }
}

// --- HOW TO USE IT ---
// This would be configured by your main script loader.

// 1. Create an instance
const swymInjector = new WishlistInjectorPOC();

// 2. Call `inject` when you are ready
// (e.g., inside your $(document).ready(), or after your app data loads)
//
// const themeCartSelector = 'a[href="/cart"]'; // This is the hard part
// swymInjector.inject(themeCartSelector);

// Example for a specific theme:
const themeSelector = 'cart-drawer-component';
swymInjector.inject(themeSelector);

