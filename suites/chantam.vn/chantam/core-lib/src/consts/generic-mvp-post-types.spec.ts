import {
  GenericMvpPostTypes,
  PostTypes,
  PublicDiscoveryPostTypes,
} from './index';

describe('Generic MVP post type policy', () => {
  it('makes every persisted canonical type creatable and publicly discoverable', () => {
    const expected = [
      PostTypes.OFFER,
      PostTypes.WANTED,
      PostTypes.CHARITY,
      PostTypes.CLASSIFIED,
      PostTypes.MERIT,
    ];

    expect(GenericMvpPostTypes).toEqual(expected);
    expect(PublicDiscoveryPostTypes).toEqual(expected);
  });
});
