import { User } from '@types/user.types';

interface AnalyticsEvent {
  event: string;
  category: string;
  action: string;
  label?: string;
  value?: number;
  userId?: string;
  metadata?: Record<string, any>;
}

class AnalyticsService {
  private gtag: any;
  private hotjar: any;
  private mixpanel: any;
  
  constructor() {
    this.initializeTrackers();
  }
  
  private initializeTrackers() {
    // Google Analytics 4
    if (typeof window !== 'undefined' && window.gtag) {
      this.gtag = window.gtag;
    }
    
    // Hotjar
    if (typeof window !== 'undefined' && window.hj) {
      this.hotjar = window.hj;
    }
    
    // Mixpanel
    if (typeof window !== 'undefined' && window.mixpanel) {
      this.mixpanel = window.mixpanel;
    }
  }
  
  public trackEvent(event: AnalyticsEvent): void {
    // Google Analytics
    if (this.gtag) {
      this.gtag('event', event.action, {
        event_category: event.category,
        event_label: event.label,
        value: event.value,
        custom_parameters: event.metadata,
      });
    }
    
    // Mixpanel
    if (this.mixpanel) {
      this.mixpanel.track(event.event, {
        category: event.category,
        action: event.action,
        label: event.label,
        value: event.value,
        ...event.metadata,
      });
    }
    
    // Custom analytics endpoint
    this.sendToCustomAnalytics(event);
  }
  
  public trackPageView(path: string, title: string): void {
    if (this.gtag) {
      this.gtag('config', process.env.VITE_GA_TRACKING_ID, {
        page_title: title,
        page_location: window.location.href,
        page_path: path,
      });
    }
    
    if (this.mixpanel) {
      this.mixpanel.track('Page View', {
        path,
        title,
        url: window.location.href,
      });
    }
  }
  
  public identifyUser(user: User): void {
    if (this.gtag) {
      this.gtag('config', process.env.VITE_GA_TRACKING_ID, {
        user_id: user.id,
        custom_map: {
          user_role: user.role,
          user_language: user.preferredLanguage,
        },
      });
    }
    
    if (this.mixpanel) {
      this.mixpanel.identify(user.id);
      this.mixpanel.people.set({
        $email: user.email,
        $first_name: user.firstName,
        $last_name: user.lastName,
        role: user.role,
        language: user.preferredLanguage,
        risk_profile: user.riskProfile,
      });
    }
    
    if (this.hotjar) {
      this.hotjar('identify', user.id, {
        email: user.email,
        role: user.role,
        language: user.preferredLanguage,
      });
    }
  }
  
  private async sendToCustomAnalytics(event: AnalyticsEvent): Promise<void> {
    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          timestamp: Date.now(),
          sessionId: this.getSessionId(),
          url: window.location.href,
          referrer: document.referrer,
        }),
      });
    } catch (error) {
      console.warn('Failed to send custom analytics:', error);
    }
  }
  
  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }
}

export const analyticsService = new Analyt
