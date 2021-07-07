import axios from 'axios';
import dayjs from 'dayjs';
import { uniqBy } from 'lodash';
const advancedFormat = require('dayjs/plugin/advancedFormat');
dayjs.extend(advancedFormat);

import withSession from '../../lib/session';
import {
  getCurrentExpiryTradingSymbol,
  getIndexInstruments,
  syncGetKiteInstance
} from '../../lib/utils';

export default withSession(async (req, res) => {
  const user = req.session.get('user');

  if (!user) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { order_tag: orderTag } = req.query;

    if (!orderTag) {
      return res.status(400).json({ error: 'expected orderTag in query' });
    }

    const { data: ordersInDB } = await axios(
      `${process.env.DATABASE_HOST_URL}/odr_${process.env.DATABASE_USER_KEY}/${orderTag}`
    );

    const kite = syncGetKiteInstance(user);
    const rawOrders = ordersInDB?.length ? ordersInDB : await kite.getOrders();
    const uniqueOrders = uniqBy(rawOrders, (order) => order.order_id);

    const orders = uniqueOrders
      .filter((order) => order.tag === orderTag)
      .sort((a, b) =>
        dayjs(a.order_timestamp).isSame(b.order_timestamp)
          ? a.transaction_type === 'BUY'
            ? 1
            : -1
          : dayjs(a.order_timestamp).isBefore(b.order_timestamp)
          ? 1
          : -1
      );

    const sourceData = await getIndexInstruments();

    const getHumanTradingSymbol = ({ tradingsymbol }) => {
      const instrumentType = tradingsymbol.substr(tradingsymbol.length - 2, 2);
      const { expiry, name, strike } = getCurrentExpiryTradingSymbol({
        sourceData,
        tradingsymbol,
        instrumentType
      });
      const dateString = dayjs(expiry)
        .format('Do MMM')
        .split(' ')
        .map((str, idx) => (idx === 1 ? str.toUpperCase() : str))
        .join(' ');
      return `${name} ${dateString} ${strike} ${instrumentType}`;
    };

    const humanOrders = orders.map((order) => ({
      ...order,
      humanTradingSymbol: getHumanTradingSymbol({ tradingsymbol: order.tradingsymbol })
    }));

    res.json(humanOrders);
  } catch (e) {
    res.status(500).send(e);
  }
});
