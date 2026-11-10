import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { strFromU8, unzipSync } from 'fflate';
import { of, Subject } from 'rxjs';

import { LogisticsApiService, type NewDelivery, type SavedDelivery } from '../logistics-api.service';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let logisticsApi: Pick<
    LogisticsApiService,
    'getLocations' | 'getDeliveries' | 'createDelivery' | 'removeDelivery' | 'clearDeliveries'
  >;

  beforeEach(async () => {
    logisticsApi = {
      getLocations: vi.fn(() =>
        of([
          {
            id: 1,
            provinceName: 'Example Province',
            locationName: 'Example Town',
            fullLabel: 'Example Town, Example Province',
            rate40_45: 46000,
            rate50: 48000,
            rate55_60: 52000,
          },
        ]),
      ),
      getDeliveries: vi.fn(() => of([])),
      createDelivery: vi.fn((delivery: NewDelivery) =>
        of({
          ...delivery,
          id: 1,
          destination: 'Example Town, Example Province',
          price: 52000,
        }),
      ),
      removeDelivery: vi.fn(() => of(undefined)),
      clearDeliveries: vi.fn(() => of(undefined)),
    };
    await TestBed.configureTestingModule({
      providers: [{ provide: LogisticsApiService, useValue: logisticsApi }],
    }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should add a delivery record and reset the form', () => {
    component.delivery = {
      date: '2026-11-09',
      drNumber: ' DR-001 ',
      truckPlate: ' ABC 1234 ',
      customerName: ' Example Customer ',
      postLength: 55,
      locationId: 1,
    };

    component.saveDelivery();

    expect(component.deliveries).toEqual([
      {
        id: 1,
        date: '2026-11-09',
        drNumber: 'DR-001',
        truckPlate: 'ABC 1234',
        customerName: 'Example Customer',
        locationId: 1,
        destination: 'Example Town, Example Province',
        postLength: 55,
        price: 52000,
      },
    ]);
    expect(logisticsApi.createDelivery).toHaveBeenCalledWith({
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      locationId: 1,
      postLength: 55,
    });
    expect(component.delivery.drNumber).toBe('');
  });

  it('should not add a delivery with missing required information', () => {
    component.delivery.drNumber = 'DR-001';

    component.saveDelivery();

    expect(component.deliveries).toHaveLength(0);
  });

  it('should show save progress until the API confirms the delivery', () => {
    const saveResponse = new Subject<SavedDelivery>();
    vi.mocked(logisticsApi.createDelivery).mockReturnValue(saveResponse.asObservable());
    component.delivery = {
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      postLength: 55,
      locationId: 1,
    };

    component.saveDelivery();
    fixture.detectChanges();

    expect(component.isSavingDelivery).toBe(true);
    expect(fixture.nativeElement.querySelector('ion-progress-bar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.submit-button').textContent).toContain('Saving delivery…');

    saveResponse.next({
      id: 1,
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      locationId: 1,
      postLength: 55,
    });
    fixture.detectChanges();

    expect(component.isSavingDelivery).toBe(false);
    expect(component.deliveries[0].destination).toBe('Example Town, Example Province');
  });

  it('should remove a delivery by id', () => {
    component.delivery = {
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      postLength: 55,
      locationId: 1,
    };
    component.saveDelivery();

    const deliveryId = component.deliveries[0].id;
    component.removeDelivery(deliveryId);

    expect(component.deliveries).toHaveLength(0);
    expect(logisticsApi.removeDelivery).toHaveBeenCalledWith(deliveryId);
  });

  it('should clear all delivery records', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    component.delivery = {
      date: '2026-11-09',
      drNumber: 'DR-001',
      truckPlate: 'ABC 1234',
      customerName: 'Example Customer',
      postLength: 55,
      locationId: 1,
    };
    component.saveDelivery();

    component.clearDeliveries();

    expect(component.deliveries).toHaveLength(0);
    expect(logisticsApi.clearDeliveries).toHaveBeenCalledOnce();
  });

  it('should leave delivery records intact when clearing is cancelled', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    component.deliveries = [
      {
        id: 1,
        date: '2026-11-09',
        drNumber: 'DR-001',
        truckPlate: 'ABC 1234',
        customerName: 'Example Customer',
        locationId: 1,
        postLength: 55,
        destination: 'Example Town',
        price: 52000,
      },
    ];

    component.clearDeliveries();

    expect(component.deliveries).toHaveLength(1);
    expect(logisticsApi.clearDeliveries).not.toHaveBeenCalled();
  });

  it('should calculate the rate from the loaded destination data without another request', () => {
    component.delivery.locationId = 1;
    component.delivery.postLength = 55;

    expect(component.calculatedPrice).toBe(52000);
    expect(logisticsApi.getLocations).toHaveBeenCalledOnce();
  });

  it('should search provinces and limit rendered destination results', () => {
    component.locations = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      provinceName: 'Cavite',
      locationName: `Location ${index + 1}`,
      fullLabel: `Location ${index + 1}, Cavite`,
      rate40_45: 46000,
      rate50: 48000,
      rate55_60: 52000,
    }));

    component.onDestinationSearch('cavite');

    expect(component.filteredLocations).toHaveLength(20);
    expect(component.filteredLocations[0].fullLabel).toBe('Location 1, Cavite');
  });

  it('should download the dispatch log as an XLSX workbook', async () => {
    component.deliveries = [
      {
        id: 1,
        date: '2026-11-09',
        drNumber: 'DR-001',
        truckPlate: 'ABC 1234',
        customerName: 'Example Customer',
        locationId: 1,
        postLength: 55,
        destination: 'Example Town, Example Province',
        price: 52000,
      },
    ];
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:dispatch-log');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const clickedLinks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push(this);
    });

    component.downloadDeliveries();

    const blob = createObjectURL.mock.calls[0][0];
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const worksheet = strFromU8(files['xl/worksheets/sheet1.xml']);

    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Dispatch Log"');
    expect(worksheet).toContain('<t xml:space="preserve">Date</t>');
    expect(worksheet).toContain('<t xml:space="preserve">DR No.</t>');
    expect(worksheet).toContain('<t xml:space="preserve">Example Customer (55 ft)</t>');
    expect(worksheet).toContain('<t xml:space="preserve">Example Town, Example Province</t>');
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dispatch-log');
    expect(clickedLinks[0].download).toMatch(/^dispatch-log-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
