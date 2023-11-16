import { CacheService } from '@commons/modules/cache/cache.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { LeanMongoModel } from '@commons/types/MongoModel';
import { safeJSONParse } from '@commons/utils';
import { Insurance } from '@modules/insurance/schemas/insurance.schema';

@Injectable()
export class InsuranceCache {
  private readonly ACTIVE_INSURANCE_KEY = 'active-insurances';

  constructor(
    private readonly cacheService: CacheService,
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,
  ) {}

  async clearActiveInsurances() {
    return this.cacheService.redisCache.del(this.ACTIVE_INSURANCE_KEY);
  }

  async setOneActiveInsurance(order: LeanMongoModel<Insurance>) {
    return this.cacheService.redisCache.hset(this.ACTIVE_INSURANCE_KEY, {
      [String(order?._id)]: JSON.stringify(order),
    });
  }

  async updateInsurance(_id: string, order: LeanMongoModel<Insurance>) {
    const _data = JSON.parse(
      await this.cacheService.redisCache.hget(
        this.ACTIVE_INSURANCE_KEY,
        String(_id),
      ),
      safeJSONParse,
    );
    if (!_data) throw new BadRequestException();
    const data = {
      ..._data,
      ...order,
    };
    await this.setOneActiveInsurance(data);
    return data;
  }

  async delActiveInsurances(_ids: string[]) {
    return this.cacheService.redisCache.hdel(
      this.ACTIVE_INSURANCE_KEY,
      ..._ids.map((id) => String(id)),
    );
  }

  async getActiveInsurances() {
    const _data = await this.cacheService.redisCache.hgetall(
      this.ACTIVE_INSURANCE_KEY,
    );
    const data = Object.values(_data || {});
    if (!data?.length) return [];
    return data?.map((o) => {
      const model = new this.insuranceModel(JSON.parse(o, safeJSONParse));
      model.isNew = false;
      return model;
    });
  }

  async getOneActiveLoan(_id: string) {
    const data = await this.cacheService.redisCache.hget(
      this.ACTIVE_INSURANCE_KEY,
      _id,
    );
    if (!data) return null;
    return new this.insuranceModel(JSON.parse(data, safeJSONParse));
  }
}
