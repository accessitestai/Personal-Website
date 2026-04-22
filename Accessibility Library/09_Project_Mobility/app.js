// Accessible Presentation JavaScript
class AccessiblePresentation {
    constructor() {
        this.currentSlide = 1;
        this.totalSlides = 15;
        this.slides = document.querySelectorAll('.slide');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.currentSlideSpan = document.getElementById('currentSlide');
        this.totalSlidesSpan = document.getElementById('totalSlides');
        
        this.init();
    }

    init() {
        // Set total slides count
        this.totalSlidesSpan.textContent = this.totalSlides;
        
        // Bind event listeners
        this.bindEvents();
        
        // Set initial state
        this.updateSlide();
        
        // Set focus to first slide for screen readers
        this.focusCurrentSlide();
        
        // Announce presentation start
        this.announceSlideChange();
    }

    bindEvents() {
        // Navigation button events
        this.prevBtn.addEventListener('click', () => this.previousSlide());
        this.nextBtn.addEventListener('click', () => this.nextSlide());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Click on slides to advance
        this.slides.forEach(slide => {
            slide.addEventListener('click', () => {
                if (this.currentSlide < this.totalSlides) {
                    this.nextSlide();
                }
            });
        });
        
        // Handle button focus for better accessibility
        this.prevBtn.addEventListener('focus', () => {
            this.announceNavigation('Previous slide button focused');
        });
        
        this.nextBtn.addEventListener('focus', () => {
            this.announceNavigation('Next slide button focused');
        });
    }

    handleKeydown(event) {
        // Prevent default behavior for presentation navigation keys
        const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Home', 'End'];
        
        // Don't interfere if user is typing in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        if (navKeys.includes(event.code)) {
            event.preventDefault();
        }

        switch (event.code) {
            case 'ArrowRight':
            case 'ArrowDown':
            case 'Space':
            case 'Enter':
                if (this.currentSlide < this.totalSlides) {
                    this.nextSlide();
                }
                break;
            
            case 'ArrowLeft':
            case 'ArrowUp':
                if (this.currentSlide > 1) {
                    this.previousSlide();
                }
                break;
            
            case 'Home':
                this.goToSlide(1);
                break;
            
            case 'End':
                this.goToSlide(this.totalSlides);
                break;
            
            // Number keys for direct slide navigation
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
            case 'Digit5':
            case 'Digit6':
            case 'Digit7':
            case 'Digit8':
            case 'Digit9':
                const slideNumber = parseInt(event.code.replace('Digit', ''));
                if (slideNumber <= this.totalSlides) {
                    this.goToSlide(slideNumber);
                }
                break;
        }
    }

    nextSlide() {
        if (this.currentSlide < this.totalSlides) {
            this.currentSlide++;
            this.updateSlide();
            this.announceSlideChange();
        }
    }

    previousSlide() {
        if (this.currentSlide > 1) {
            this.currentSlide--;
            this.updateSlide();
            this.announceSlideChange();
        }
    }

    goToSlide(slideNumber) {
        if (slideNumber >= 1 && slideNumber <= this.totalSlides) {
            this.currentSlide = slideNumber;
            this.updateSlide();
            this.announceSlideChange();
        }
    }

    updateSlide() {
        // Hide all slides
        this.slides.forEach((slide, index) => {
            slide.classList.remove('active');
            slide.setAttribute('aria-hidden', 'true');
            slide.setAttribute('tabindex', '-1');
        });

        // Show current slide
        const currentSlideEl = this.slides[this.currentSlide - 1];
        currentSlideEl.classList.add('active');
        currentSlideEl.setAttribute('aria-hidden', 'false');
        currentSlideEl.setAttribute('tabindex', '0');

        // Update counter
        this.currentSlideSpan.textContent = this.currentSlide;

        // Update navigation buttons
        this.prevBtn.disabled = this.currentSlide === 1;
        this.nextBtn.disabled = this.currentSlide === this.totalSlides;

        // Update button labels for better accessibility
        this.prevBtn.setAttribute('aria-label', 
            this.currentSlide === 1 ? 
            'Previous slide (currently on first slide)' : 
            `Previous slide (go to slide ${this.currentSlide - 1})`
        );
        
        this.nextBtn.setAttribute('aria-label', 
            this.currentSlide === this.totalSlides ? 
            'Next slide (currently on last slide)' : 
            `Next slide (go to slide ${this.currentSlide + 1})`
        );

        // Focus management
        this.focusCurrentSlide();
    }

    focusCurrentSlide() {
        // Focus the current slide for screen readers
        const currentSlideEl = this.slides[this.currentSlide - 1];
        
        // Small delay to ensure slide transition is complete
        setTimeout(() => {
            currentSlideEl.focus();
        }, 100);
    }

    announceSlideChange() {
        const currentSlideEl = this.slides[this.currentSlide - 1];
        const slideTitle = currentSlideEl.querySelector('.slide-title').textContent;
        
        // Create announcement for screen readers
        const announcement = `Slide ${this.currentSlide} of ${this.totalSlides}: ${slideTitle}`;
        
        // Use the existing slide counter element for announcements
        const slideCounter = document.querySelector('.slide-counter');
        slideCounter.setAttribute('aria-live', 'polite');
        slideCounter.setAttribute('aria-atomic', 'true');
        
        // Add screen reader specific announcement
        this.announceToScreenReader(announcement);
    }

    announceToScreenReader(message) {
        // Create a temporary element for screen reader announcements
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    announceNavigation(message) {
        // Announce navigation actions for screen readers
        this.announceToScreenReader(message);
    }

    // Method to get slide content for screen readers
    getSlideContent(slideIndex) {
        const slide = this.slides[slideIndex];
        const title = slide.querySelector('.slide-title')?.textContent || '';
        const content = slide.querySelector('.slide-body')?.textContent || '';
        
        return `${title}. ${content}`;
    }

    // Auto-advance functionality (optional)
    startAutoAdvance(intervalMs = 30000) {
        this.autoAdvanceInterval = setInterval(() => {
            if (this.currentSlide < this.totalSlides) {
                this.nextSlide();
            } else {
                this.stopAutoAdvance();
            }
        }, intervalMs);
        
        this.announceToScreenReader('Auto-advance started. Press any key to stop.');
    }

    stopAutoAdvance() {
        if (this.autoAdvanceInterval) {
            clearInterval(this.autoAdvanceInterval);
            this.autoAdvanceInterval = null;
            this.announceToScreenReader('Auto-advance stopped.');
        }
    }

    // Toggle auto-advance with keyboard shortcut
    toggleAutoAdvance() {
        if (this.autoAdvanceInterval) {
            this.stopAutoAdvance();
        } else {
            this.startAutoAdvance();
        }
    }
}

// Additional accessibility utilities
class AccessibilityUtils {
    static addSkipLinks() {
        // Add skip links for better navigation
        const skipLinks = document.createElement('nav');
        skipLinks.className = 'skip-links';
        skipLinks.setAttribute('aria-label', 'Skip navigation');
        
        const skipToSlides = document.createElement('a');
        skipToSlides.href = '#slides-container';
        skipToSlides.textContent = 'Skip to slides';
        skipToSlides.className = 'skip-nav';
        
        skipLinks.appendChild(skipToSlides);
        document.body.insertBefore(skipLinks, document.body.firstChild);
    }

    static enhanceKeyboardNavigation() {
        // Ensure all interactive elements are keyboard accessible
        const interactiveElements = document.querySelectorAll('button, a, [tabindex="0"]');
        
        interactiveElements.forEach(element => {
            element.addEventListener('keydown', (e) => {
                if (e.code === 'Enter' || e.code === 'Space') {
                    if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') {
                        e.preventDefault();
                        element.click();
                    }
                }
            });
        });
    }

    static addARIALandmarks() {
        // Ensure proper ARIA landmarks
        const slidesContainer = document.querySelector('.slides-container');
        if (slidesContainer && !slidesContainer.getAttribute('role')) {
            slidesContainer.setAttribute('role', 'region');
            slidesContainer.setAttribute('aria-label', 'Presentation slides');
        }
    }

    static setupReducedMotion() {
        // Respect user's reduced motion preferences
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        
        if (prefersReducedMotion.matches) {
            document.body.classList.add('reduced-motion');
        }
        
        // Listen for changes
        prefersReducedMotion.addEventListener('change', (e) => {
            if (e.matches) {
                document.body.classList.add('reduced-motion');
            } else {
                document.body.classList.remove('reduced-motion');
            }
        });
    }

    static addHighContrastSupport() {
        // Add high contrast mode detection and support
        const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
        
        if (prefersHighContrast.matches) {
            document.body.classList.add('high-contrast');
        }
        
        prefersHighContrast.addEventListener('change', (e) => {
            if (e.matches) {
                document.body.classList.add('high-contrast');
            } else {
                document.body.classList.remove('high-contrast');
            }
        });
    }
}

// Initialize presentation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize main presentation
    const presentation = new AccessiblePresentation();
    
    // Apply accessibility enhancements
    AccessibilityUtils.addSkipLinks();
    AccessibilityUtils.enhanceKeyboardNavigation();
    AccessibilityUtils.addARIALandmarks();
    AccessibilityUtils.setupReducedMotion();
    AccessibilityUtils.addHighContrastSupport();
    
    // Add keyboard shortcut for auto-advance toggle (Alt + A)
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === 'KeyA') {
            e.preventDefault();
            presentation.toggleAutoAdvance();
        }
    });
    
    // Add presentation controls info to screen readers
    const controlsInfo = document.createElement('div');
    controlsInfo.className = 'sr-only';
    controlsInfo.setAttribute('aria-live', 'polite');
    controlsInfo.textContent = 'Use arrow keys, space bar, or enter to navigate slides. Press Alt+A to toggle auto-advance.';
    document.body.appendChild(controlsInfo);
    
    // Announce when presentation is ready
    setTimeout(() => {
        const readyAnnouncement = document.createElement('div');
        readyAnnouncement.className = 'sr-only';
        readyAnnouncement.setAttribute('aria-live', 'polite');
        readyAnnouncement.textContent = 'AI-Powered Mobility Assistant presentation is ready. Use arrow keys or buttons to navigate.';
        document.body.appendChild(readyAnnouncement);
        
        setTimeout(() => {
            document.body.removeChild(readyAnnouncement);
        }, 3000);
    }, 500);
});

// Global keyboard shortcuts help
document.addEventListener('keydown', (e) => {
    // Show help with F1 or ?
    if (e.code === 'F1' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        showKeyboardHelp();
    }
});

function showKeyboardHelp() {
    const helpText = `
    Keyboard Navigation Help:
    • Arrow Keys: Navigate between slides
    • Space/Enter: Next slide
    • Home: Go to first slide
    • End: Go to last slide
    • Number keys (1-9): Jump to specific slide
    • Alt + A: Toggle auto-advance
    • F1 or ?: Show this help
    • Tab: Move between navigation controls
    `;
    
    // Announce help to screen readers
    const helpAnnouncement = document.createElement('div');
    helpAnnouncement.className = 'sr-only';
    helpAnnouncement.setAttribute('aria-live', 'polite');
    helpAnnouncement.textContent = helpText;
    document.body.appendChild(helpAnnouncement);
    
    setTimeout(() => {
        document.body.removeChild(helpAnnouncement);
    }, 5000);
    
    // Also log to console for sighted users
    console.log(helpText);
}