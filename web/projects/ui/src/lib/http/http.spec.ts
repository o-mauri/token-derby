import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_HOSTNAME, ApiError, apiBaseUrl, apiErrors } from './http';

function setup(hostname = 'localhost') {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiBaseUrl, apiErrors])),
      provideHttpClientTesting(),
      { provide: API_HOSTNAME, useValue: hostname },
    ],
  });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController) };
}

describe('apiBaseUrl', () => {
  it('leaves relative API paths alone off the production host', () => {
    const { http, ctrl } = setup('localhost');
    void firstValueFrom(http.get('/api/races/ABC'));
    ctrl.expectOne('/api/races/ABC').flush({});
  });

  it('sends API calls straight to the API host in production', () => {
    const { http, ctrl } = setup('app.tokenderby.co.uk');
    void firstValueFrom(http.get('/api/races/ABC'));
    ctrl.expectOne('https://api.tokenderby.co.uk/races/ABC').flush({});
  });
});

describe('apiErrors', () => {
  it('turns a JSON error body into a typed ApiError carrying its code', async () => {
    const { http, ctrl } = setup();
    const p = firstValueFrom(http.get('/api/races/NOPE'));
    ctrl.expectOne('/api/races/NOPE').flush({ code: 'RACE_NOT_FOUND', message: 'No such race' }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toEqual(new ApiError('RACE_NOT_FOUND', 'No such race', 404));
  });

  it('calls anything else a network error', async () => {
    const { http, ctrl } = setup();
    const p = firstValueFrom(http.get('/api/races/X'));
    ctrl.expectOne('/api/races/X').error(new ProgressEvent('error'), { status: 0 });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
  });
});
