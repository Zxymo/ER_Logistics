import { DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonProgressBar, IonSpinner } from '@ionic/angular';
import { strToU8, zipSync } from 'fflate';

import { LogisticsApiService, type DeliveryRecord, type HaulingLocation } from '../logistics-api.service';

interface DeliveryDraft {
  date: string;
  drNumber: string;
  truckPlate: string;
  customerName: string;
  postLength: number | null;
  locationId: number | null;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [DecimalPipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonProgressBar, IonSpinner],
})
export class HomePage implements OnInit {
  delivery: DeliveryDraft = this.createEmptyDelivery();
  deliveries: DeliveryRecord[] = [];
  locations: HaulingLocation[] = [];
  destinationSearch = '';
  destinationOptionsOpen = false;
  locationError: string | null = null;
  deliveriesError: string | null = null;
  deliveryError: string | null = null;
  loadingLocations = true;
  loadingDeliveries = true;
  isSavingDelivery = false;

  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  get calculatedPrice(): number | null {
    const location = this.locations.find((item) => item.id === this.delivery.locationId);

    switch (this.delivery.postLength) {
      case 40:
      case 45:
        return location?.rate40_45 ?? null;
      case 50:
        return location?.rate50 ?? null;
      case 55:
      case 60:
        return location?.rate55_60 ?? null;
      default:
        return null;
    }
  }

  get filteredLocations(): HaulingLocation[] {
    const query = this.destinationSearch.trim().toLocaleLowerCase();
    const matches = query
      ? this.locations.filter((location) => location.fullLabel.toLocaleLowerCase().includes(query))
      : this.locations;

    return matches.slice(0, 20);
  }

  ngOnInit(): void {
    this.logisticsApi.getLocations().subscribe({
      next: (locations) => {
        this.locations = locations;
        this.locationError = null;
        const selectedLocation = locations.find((location) => location.id === this.delivery.locationId);
        if (selectedLocation) {
          this.destinationSearch = selectedLocation.fullLabel;
        }
        this.loadingLocations = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.locationError = 'Could not load destinations. Check the API and database connection.';
        this.loadingLocations = false;
        this.changeDetector.markForCheck();
      },
    });

    this.logisticsApi.getDeliveries().subscribe({
      next: (deliveries) => {
        this.deliveries = deliveries;
        this.deliveriesError = null;
        this.loadingDeliveries = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.deliveriesError = 'Could not load delivery records. Check the API and database connection.';
        this.loadingDeliveries = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  onDestinationSearch(value: string): void {
    this.destinationSearch = value;
    this.delivery.locationId = null;
    this.destinationOptionsOpen = true;
  }

  selectLocation(location: HaulingLocation): void {
    this.delivery.locationId = location.id;
    this.destinationSearch = location.fullLabel;
    this.destinationOptionsOpen = false;
  }

  saveDelivery(): void {
    const { date, drNumber, truckPlate, customerName, postLength, locationId } = this.delivery;
    const trimmedDrNumber = drNumber.trim();
    const trimmedTruckPlate = truckPlate.trim();
    const trimmedCustomerName = customerName.trim();
    const selectedLocation = this.locations.find((location) => location.id === locationId);
    const price = this.calculatedPrice;

    if (
      this.isSavingDelivery ||
      !date ||
      !trimmedDrNumber ||
      !trimmedTruckPlate ||
      !trimmedCustomerName ||
      postLength === null ||
      !Number.isFinite(postLength) ||
      postLength <= 0 ||
      !selectedLocation ||
      price === null
    ) {
      return;
    }

    this.isSavingDelivery = true;
    this.deliveryError = null;
    this.logisticsApi
      .createDelivery({
        date,
        drNumber: trimmedDrNumber,
        truckPlate: trimmedTruckPlate,
        customerName: trimmedCustomerName,
        locationId: selectedLocation.id,
        postLength,
      })
      .subscribe({
        next: (savedDelivery) => {
          this.deliveries = [{ ...savedDelivery, destination: selectedLocation.fullLabel, price }, ...this.deliveries];
          this.delivery = this.createEmptyDelivery();
          this.destinationSearch = '';
          this.destinationOptionsOpen = false;
          this.isSavingDelivery = false;
          this.changeDetector.markForCheck();
        },
        error: () => {
          this.deliveryError = 'Could not save the delivery. Check the API and database connection.';
          this.isSavingDelivery = false;
          this.changeDetector.markForCheck();
        },
      });
  }

  removeDelivery(id: number): void {
    this.deliveryError = null;
    this.logisticsApi.removeDelivery(id).subscribe({
      next: () => {
        this.deliveries = this.deliveries.filter((delivery) => delivery.id !== id);
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.deliveryError = 'Could not remove the delivery. Check the API and database connection.';
        this.changeDetector.markForCheck();
      },
    });
  }

  clearDeliveries(): void {
    if (!window.confirm('Clear all delivery records? This cannot be undone.')) {
      return;
    }

    this.deliveryError = null;
    this.logisticsApi.clearDeliveries().subscribe({
      next: () => {
        this.deliveries = [];
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.deliveryError = 'Could not clear deliveries. Check the API and database connection.';
        this.changeDetector.markForCheck();
      },
    });
  }

  downloadDeliveries(): void {
    const rows: (string | number)[][] = [
      ['Date', 'DR No.', 'Truck Plate No.', "Customer's Name", 'Destination', 'Hauling Rate'],
      ...this.deliveries.map((item) => [
        item.date,
        item.drNumber,
        item.truckPlate,
        `${item.customerName} (${item.postLength} ft)`,
        item.destination,
        item.price ?? '',
      ]),
    ];
    const worksheetRows = rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((value, columnIndex) => {
              const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;

              return typeof value === 'number' && Number.isFinite(value)
                ? `<c r="${reference}"><v>${value}</v></c>`
                : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(String(value))}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('');
    const files = {
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
      'xl/workbook.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="Dispatch Log" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          `<sheetData>${worksheetRows}</sheetData></worksheet>`,
      ),
    };
    const blob = new Blob([zipSync(files).slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `dispatch-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  }

  private escapeXml(value: string): string {
    return value.replace(/[<>&"']/g, (character) => {
      switch (character) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case '"':
          return '&quot;';
        case "'":
          return '&apos;';
        default:
          return character;
      }
    });
  }

  private createEmptyDelivery(): DeliveryDraft {
    const today = new Date();
    const date = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    return {
      date,
      drNumber: '',
      truckPlate: '',
      customerName: '',
      postLength: null,
      locationId: null,
    };
  }
}
