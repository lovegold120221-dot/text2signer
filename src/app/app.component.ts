import {Component, inject} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {filter, tap} from 'rxjs/operators';
import {firstValueFrom} from 'rxjs';
import {NavigationEnd, Router} from '@angular/router';
import {GoogleAnalyticsService} from './core/modules/google-analytics/google-analytics.service';
import {languageCodeNormalizer} from './core/modules/transloco/languages';
import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
import {getUrlParams} from './core/helpers/url';
import {APPLE_APP_STORE_ID} from './core/constants';
import {MediaMatcher} from '@angular/cdk/layout';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private ga = inject(GoogleAnalyticsService);
  private transloco = inject(TranslocoService);
  private router = inject(Router);
  private mediaMatcher = inject(MediaMatcher);

  urlParams = getUrlParams();

  constructor() {
    this.listenLanguageChange();
    this.logRouterNavigation();
    this.checkURLEmbedding();
    this.updateToolbarColor();
    this.setScrollbarWidth();
    this.setSmartAppBanner();
  }

  updateToolbarColor() {
    if (!('window' in globalThis)) {
      return;
    }

    const matcher = this.mediaMatcher.matchMedia('(prefers-color-scheme: dark)');

    function onColorSchemeChange(): any {
      const toolbar = document.querySelector('ion-toolbar');
      if (!toolbar) {
        // Try again if the toolbar is not yet available
        return requestAnimationFrame(onColorSchemeChange);
      }

      const toolbarColor = window.getComputedStyle(toolbar).getPropertyValue('--background');
      if (!toolbarColor) {
        // Try again if the color is not yet available
        return requestAnimationFrame(onColorSchemeChange);
      }

      // Update the theme-color meta tag with the toolbar color
      const mode = matcher.matches ? 'dark' : 'light';
      const selector = `meta[name="theme-color"][media="(prefers-color-scheme: ${mode})"]`;
      const themeColor = document.head.querySelector(selector);
      themeColor.setAttribute('content', toolbarColor);
    }

    matcher.addEventListener('change', onColorSchemeChange);
    onColorSchemeChange();
  }

  setScrollbarWidth() {
    if (!('window' in globalThis)) {
      return;
    }

    const measure = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;overflow:scroll;width:100px;height:100px;';
      document.body.appendChild(probe);
      const width = probe.offsetWidth - probe.clientWidth;
      probe.remove();
      document.documentElement.style.setProperty('--scrollbar-width', `${width}px`);
    };

    measure();
    window.addEventListener('resize', measure);
  }

  logRouterNavigation() {
    const isLanguageLoaded = firstValueFrom(
      this.transloco.events$.pipe(filter(e => e.type === 'translationLoadSuccess'))
    );

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        tap(async (event: NavigationEnd) => {
          await isLanguageLoaded; // Before triggering page view, wait for language to be loaded
          await this.ga.setCurrentScreen(event.urlAfterRedirects);
        })
      )
      .subscribe();
  }

  listenLanguageChange() {
    const urlParam = this.urlParams.get('lang');

    if (!('navigator' in globalThis) || !('document' in globalThis)) {
      if (urlParam) {
        this.transloco.setActiveLang(urlParam);
      }
      return;
    }

    this.transloco.langChanges$
      .pipe(
        tap(lang => {
          document.documentElement.lang = lang;
          document.dir = ['he', 'ar', 'fa', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi'].includes(lang) ? 'rtl' : 'ltr';
        })
      )
      .subscribe();

    this.transloco.setActiveLang(urlParam || languageCodeNormalizer(navigator.language));
  }

  setSmartAppBanner(): void {
    if (!('document' in globalThis)) {
      return;
    }
    const meta = document.createElement('meta');
    meta.name = 'apple-itunes-app';
    meta.content = `app-id=${APPLE_APP_STORE_ID}`;
    document.head.appendChild(meta);
  }

  checkURLEmbedding(): void {
    const urlParam = this.urlParams.get('embed');
    if (urlParam !== null) {
      document.body.classList.add('embed');
    }
  }
}
