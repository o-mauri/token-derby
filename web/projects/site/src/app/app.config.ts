import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { apiBaseUrl, apiErrors } from '@token-derby/ui';
import { routes } from './app.routes';
import { provideTrailingSlashUrls } from './trailing-slash';
import { provideSession } from './session/session';
import { sessionAuth } from './session/session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([sessionAuth, apiBaseUrl, apiErrors])),
    provideRouter(routes, withComponentInputBinding()),
    provideTrailingSlashUrls(),
    provideSession(),
  ],
};
