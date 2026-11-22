EW=2092957703
IL=E09000001,E09000007,E09000012,E09000013,E09000014,E09000019,E09000020,E09000022,E09000023,E09000025,E09000028,E09000030,E09000032,E09000033
for d in NM_2020_1 NM_2132_1 NM_2131_1 NM_2124_1 NM_2102_1 NM_2202_1 NM_2207_1 NM_2023_1 NM_2072_1 NM_2070_1 NM_2174_1 NM_2143_1 NM_2084_1 NM_2157_1 NM_2199_1 NM_2235_1 NM_2041_1 NM_2083_1 NM_2024_1; do
  for g in EW IL; do
    gv=${!g}; curl -sS -m 120 "https://www.nomisweb.co.uk/api/v01/dataset/$d.data.csv?date=latest&geography=$gv&measures=20100" -o "$d.$g.csv" 2>&1 | head -2
  done
  echo "$d $(wc -l < $d.EW.csv) $(head -1 $d.EW.csv | cut -c1-300)"
done
