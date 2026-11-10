import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { shareReplay, type Observable } from 'rxjs';

import { environment } from '../environments/environment';

export interface HaulingLocation {
  id: number;
  provinceName: string;
  locationName: string;
  fullLabel: string;
  rate40_45: number;
  rate50: number;
  rate55_60: number;
}

export interface DeliveryRecord {
  id: number;
  date: string;
  drNumber: string;
  truckPlate: string;
  customerName: string;
  locationId: number;
  destination: string;
  postLength: number;
  price: number;
}

export interface NewDelivery {
  date: string;
  drNumber: string;
  truckPlate: string;
  customerName: string;
  locationId: number;
  postLength: number;
}

export type SavedDelivery = Omit<DeliveryRecord, 'destination' | 'price'>;

@Injectable({ providedIn: 'root' })
export class LogisticsApiService {
  private readonly apiUrl = environment.apiBaseUrl;
  private readonly http = inject(HttpClient);
  private locationsRequest?: Observable<HaulingLocation[]>;

  getLocations(): Observable<HaulingLocation[]> {
    this.locationsRequest ??= this.http
      .get<HaulingLocation[]>(`${this.apiUrl}/locations`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.locationsRequest;
  }

  getRate(locationId: number, postLength: number): Observable<{ price: number | null }> {
    const params = new HttpParams().set('locationId', locationId).set('postLength', postLength);
    return this.http.get<{ price: number | null }>(`${this.apiUrl}/rates`, { params });
  }

  getDeliveries(): Observable<DeliveryRecord[]> {
    return this.http.get<DeliveryRecord[]>(`${this.apiUrl}/deliveries`);
  }

  createDelivery(delivery: NewDelivery): Observable<SavedDelivery> {
    return this.http.post<SavedDelivery>(`${this.apiUrl}/deliveries`, delivery);
  }

  removeDelivery(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/deliveries/${id}`);
  }

  clearDeliveries(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/deliveries`);
  }
}
