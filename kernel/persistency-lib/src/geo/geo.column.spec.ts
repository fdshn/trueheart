import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { GeoColumn } from './geo.column';

class PreciseLocationEntity {
  @GeoColumn({ name: 'default_location', nullable: true, precision: 15 })
  defaultLocation: { lat: number; lng: number } | null;
}

describe('GeoColumn', () => {
  it('passes GeoJSON output precision to TypeORM spatial metadata', () => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === PreciseLocationEntity &&
        candidate.propertyName === 'defaultLocation',
    );

    expect(column?.options).toMatchObject({
      type: 'geography',
      name: 'default_location',
      nullable: true,
      precision: 15,
    });
  });
});
