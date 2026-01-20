import express from "express";
import axios from "axios";
import cors from 'cors';

interface Player {
  name: string;
  category: string;
  roundScore: number;
  place?: number;
  points: number;
}

const assignPoints = (players: Player[], pointsByPlace?: number[]) => {
  const defaultPointsByPlace = [
    100, 85, 75, 70, 65, 60, 55, 50, 46, 42, 38, 34, 30, 27, 24, 21, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1
  ];
  const pointsByPlaceToUse = pointsByPlace ?? defaultPointsByPlace;
  const sortedPlayers = players.sort((a, b) => a.roundScore - b.roundScore);

  let lastScore: number | undefined = undefined;
  let lastPlace = 0;
  let lastPoints = 0;

  sortedPlayers.forEach((player, index) => {
    if (player.roundScore !== lastScore) {
      lastPlace = index + 1;
      lastPoints = pointsByPlaceToUse[lastPlace - 1] || 1;
    }

    player.place = lastPlace;
    player.points = lastPoints;

    lastScore = player.roundScore;
  });
};

const fetchAndGroupPlayers = async (
  url: string,
  roundNum: number,
  pointsByPlace?: number[]
) => {
  const resultsByCategory: { [key: string]: any[] } = {};

  const response = await axios.get(url);
  const subCompetitions = response.data.Competition.SubCompetitions;

  subCompetitions.forEach((round: any) => {
    round.Results.forEach((result: any) => {
      const { Name, Sum, ClassName, DNF } = result;

      // Skip players with DNF - they don't participate in this round
      if (DNF == 1) {
        return;
      }

      if (!resultsByCategory[ClassName]) {
        resultsByCategory[ClassName] = [];
      }

      const existingPlayer = resultsByCategory[ClassName].find(
        (player) => player.name === Name
      );

      if (existingPlayer) {
        existingPlayer.roundScore += Sum;
      } else {
        resultsByCategory[ClassName].push({
          name: Name,
          category: ClassName,
          roundScore: Sum,
        });
      }
    });
  });

  Object.keys(resultsByCategory).forEach((category) => {
    const players = resultsByCategory[category];
    assignPoints(players, pointsByPlace);
    players.sort((a, b) => a.place - b.place); 
  });

  const wrappedResults = { [`kolejka${roundNum}`]: resultsByCategory };

  return wrappedResults;
};

const parsePDGAData = (
  pdgaData: any,
  roundNum: number,
  pointsByPlace?: number[]
) => {
  const resultsByCategory: { [key: string]: any[] } = {};
  
  // Map PDGA category codes to our category names
  const categoryMap: { [key: string]: string } = {
    "MPO": "Pro Open",
    "FPO": "Women's Pro Open",
    "MP40": "Mixed Pro 40+",
    "MA3": "Mixed Amateur 3",
    "MA4": "Mixed Amateur 4"
  };

  pdgaData.categories.forEach((category: any) => {
    const categoryName = categoryMap[category.code] || category.name;
    
    if (!resultsByCategory[categoryName]) {
      resultsByCategory[categoryName] = [];
    }

    // Process each result (place) in the category
    category.results.forEach((result: any) => {
      // Process each player at this place
      result.players.forEach((player: any) => {
        // Use the total score for point assignment
        resultsByCategory[categoryName].push({
          name: player.name,
          category: categoryName,
          roundScore: player.total,
        });
      });
    });
  });

  // Assign points based on scores within each category
  Object.keys(resultsByCategory).forEach((category) => {
    const players = resultsByCategory[category];
    assignPoints(players, pointsByPlace);
    players.sort((a, b) => a.place - b.place); 
  });

  const wrappedResults = { [`kolejka${roundNum}`]: resultsByCategory };
  return wrappedResults;
};

const fetchAndProcessResults = async (
  roundUrls: (string | any)[],
  pointsByPlace?: number[]
) => {
  let combinedResults: any[] = [];

  for (let roundNum = 1; roundNum <= roundUrls.length; roundNum++) {
    const roundData = roundUrls[roundNum - 1];
    
    // Check if it's a PDGA JSON object or a URL string
    if (typeof roundData === 'string') {
      // It's a URL - fetch from discgolfmetrix
      const roundResults = await fetchAndGroupPlayers(roundData, roundNum, pointsByPlace);
      combinedResults.push(roundResults);
    } else {
      // It's a PDGA JSON object
      const roundResults = parsePDGAData(roundData, roundNum, pointsByPlace);
      combinedResults.push(roundResults);
    }
  }

  return combinedResults;
};

const mergeResults = (combinedResults: any[]) => {
  const resultsByCategory: { [category: string]: any[] } = {};

  combinedResults.forEach((roundResult, roundIndex) => {
    Object.keys(roundResult).forEach((roundKey) => {
      const roundData = roundResult[roundKey]; 

      if (typeof roundData === 'object') {
        Object.keys(roundData).forEach((category) => {
          const playersInCategory = roundData[category];
          if (Array.isArray(playersInCategory)) {
            playersInCategory.forEach((player: any) => {
              const { name, points } = player;
              if (!resultsByCategory[category]) {
                resultsByCategory[category] = [];
              }
              const existingPlayer = resultsByCategory[category].find((p) => p.name === name);

              if (existingPlayer) {
                if (roundIndex === 0) existingPlayer.points1 = points;
                if (roundIndex === 1) existingPlayer.points2 = points;
                if (roundIndex === 2) existingPlayer.points3 = points;
                if (roundIndex === 3) existingPlayer.points4 = points;
                if (roundIndex === 4) existingPlayer.points5 = points;
                if (roundIndex === 5) existingPlayer.points6 = points;
                if (roundIndex === 6) existingPlayer.points7 = points;
              } else {
                const newPlayer = {
                  name,
                  category,
                  points1: roundIndex === 0 ? points : null,
                  points2: roundIndex === 1 ? points : null,
                  points3: roundIndex === 2 ? points : null,
                  points4: roundIndex === 3 ? points : null,
                  points5: roundIndex === 4 ? points : null,
                  points6: roundIndex === 5 ? points : null,
                  points7: roundIndex === 6 ? points : null,
                  totalPoints: points,
                };
                resultsByCategory[category].push(newPlayer);
              }
            });
          } else {
            console.warn(`Oczekiwana tablica graczy w kategorii '${category}', ale otrzymano coś innego.`);
          }
        });
      } else {
        console.warn(`Oczekiwana struktura obiektu dla rundy '${roundKey}', ale otrzymano coś innego.`);
      }
    });
  });

  Object.keys(resultsByCategory).forEach((category) => {
    const playersInCategory = resultsByCategory[category];

    playersInCategory.forEach((player) => {
      // Collect all round points, filter out null values, sort descending, and take top 4
      const allPoints = [
        player.points1,
        player.points2,
        player.points3,
        player.points4,
        player.points5,
        player.points6,
        player.points7
      ].filter((points): points is number => points !== null && points !== undefined);
      
      // Sort in descending order and take top 4
      const top4Points = allPoints.sort((a, b) => b - a).slice(0, 4);
      
      // Sum the top 4 rounds
      player.totalPoints = top4Points.reduce((sum, points) => sum + points, 0);
    });

    playersInCategory.sort((a, b) => b.totalPoints - a.totalPoints);

    let lastPlace = 0;
    let lastPoints = -1;

    playersInCategory.forEach((player, index) => {
      if (player.totalPoints !== lastPoints) {
        lastPlace = index + 1;
        lastPoints = player.totalPoints;
      }

      player.place = lastPlace;
    });
  });

  return resultsByCategory;
};

// Express app
const app = express();
app.use(cors());

const getVol12PointsByPlace = (maxPlaces: number) => {
  const points: number[] = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55];
  for (let place = 11; place <= maxPlaces; place += 1) {
    const value = 65 - place;
    points.push(value > 1 ? value : 1);
  }
  return points;
};

// Define routes
app.get("/results-crl-vol1", async (req, res) => {
  const pointsByPlace = getVol12PointsByPlace(100);
  const roundUrls = [
    "https://discgolfmetrix.com/api.php?content=result&id=2420358", // round1
    "https://discgolfmetrix.com/api.php?content=result&id=2428643", // round2
    "https://discgolfmetrix.com/api.php?content=result&id=2442153", // round3
    "https://discgolfmetrix.com/api.php?content=result&id=2448578", // round4
    "https://discgolfmetrix.com/api.php?content=result&id=2455733", // round5
    "https://discgolfmetrix.com/api.php?content=result&id=2540142", // round6
  ];

  try {
    const combinedResults = await fetchAndProcessResults(roundUrls, pointsByPlace);
    const finalResults = mergeResults(combinedResults);
    res.json(finalResults);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing results");
  }
});

app.get("/results-crl-vol2", async (req, res) => {
  const pointsByPlace = getVol12PointsByPlace(100);
  const round6PDGAData = {
    "categories": [
      {
        "code": "MPO",
        "name": "Mixed Pro Open",
        "results": [
          { "place": 1, "players": [{ "name": "Bartosz Wiśniewski", "pdga": 226131, "rating": 914, "score_relative": -6, "rounds": [51, 61], "total": 112, "points": 150.0 }] },
          { "place": 2, "players": [{ "name": "Maciej Litwinienko", "pdga": 187919, "rating": 933, "score_relative": -6, "rounds": [56, 56], "total": 112, "points": 145.0 }] },
          { "place": 3, "players": [{ "name": "Oskar Żuchliński", "pdga": 210677, "rating": 932, "score_relative": -5, "rounds": [55, 58], "total": 113, "points": 140.0 }] },
          { "place": 4, "players": [{ "name": "Michał Rozynek", "pdga": 190601, "rating": 915, "score_relative": -1, "rounds": [59, 58], "total": 117, "points": 135.0 }] },
          { "place": 5, "players": [{ "name": "Jacek Ciechanowski", "pdga": 191107, "rating": 906, "score_relative": 0, "rounds": [60, 58], "total": 118, "points": 130.0 }] },
          {
            "place": 6,
            "players": [
              { "name": "Antoni Zakroczymski", "pdga": 166233, "rating": 932, "score_relative": 2, "rounds": [61, 59], "total": 120, "points": 125.0 },
              { "name": "Piotr Borkowski", "pdga": 166228, "rating": 915, "score_relative": 2, "rounds": [59, 61], "total": 120, "points": 125.0 },
              { "name": "Marek Gontarz", "pdga": 154681, "rating": 910, "score_relative": 2, "rounds": [57, 63], "total": 120, "points": 125.0 }
            ]
          },
          {
            "place": 9,
            "players": [
              { "name": "Krzysztof Wrzeszcz", "pdga": 154318, "rating": 916, "score_relative": 4, "rounds": [64, 58], "total": 122, "points": 110.0 },
              { "name": "Robert Hejda", "pdga": 270817, "rating": 861, "score_relative": 4, "rounds": [61, 61], "total": 122, "points": 110.0 }
            ]
          },
          {
            "place": 11,
            "players": [
              { "name": "Filip Mieczykowski", "pdga": 245679, "rating": 879, "score_relative": 7, "rounds": [64, 61], "total": 125, "points": 100.0 },
              { "name": "Mikołaj Rybaczuk", "pdga": 208323, "rating": 851, "score_relative": 7, "rounds": [62, 63], "total": 125, "points": 100.0 }
            ]
          },
          { "place": 13, "players": [{ "name": "Kamil Tarnecki", "pdga": 241785, "rating": 897, "score_relative": 8, "rounds": [60, 66], "total": 126, "points": 90.0 }] },
          {
            "place": 14,
            "players": [
              { "name": "Mateusz Bzówka", "pdga": 178828, "rating": 874, "score_relative": 9, "rounds": [66, 61], "total": 127, "points": 85.0 },
              { "name": "Grzegorz Witczak", "pdga": 196586, "rating": 886, "score_relative": 9, "rounds": [65, 62], "total": 127, "points": 85.0 }
            ]
          },
          { "place": 16, "players": [{ "name": "Michal Maciolek", "pdga": 265308, "rating": 878, "score_relative": 10, "rounds": [64, 64], "total": 128, "points": 75.0 }] },
          { "place": 17, "players": [{ "name": "Robert Wilpiszewski", "pdga": 241096, "rating": 884, "score_relative": 11, "rounds": [65, 64], "total": 129, "points": 70.0 }] },
          { "place": 18, "players": [{ "name": "Wojciech Starzewski", "pdga": 106629, "rating": 937, "score_relative": 12, "rounds": [61, 69], "total": 130, "points": 65.0 }] },
          {
            "place": 19,
            "players": [
              { "name": "Michał Bordzoł", "pdga": 155061, "rating": 826, "score_relative": 14, "rounds": [69, 63], "total": 132, "points": 60.0 },
              { "name": "Mateusz Ukleja", "pdga": 249433, "rating": 889, "score_relative": 14, "rounds": [63, 69], "total": 132, "points": 60.0 }
            ]
          },
          {
            "place": 21,
            "players": [
              { "name": "Adam Genderka", "pdga": 230225, "rating": 854, "score_relative": 15, "rounds": [70, 63], "total": 133, "points": 50.0 },
              { "name": "Grzegorz Urbański", "pdga": 205605, "rating": 860, "score_relative": 15, "rounds": [63, 70], "total": 133, "points": 50.0 },
              { "name": "Cezary Więch", "pdga": 185574, "rating": 886, "score_relative": 15, "rounds": [62, 71], "total": 133, "points": 50.0 }
            ]
          },
          {
            "place": 24,
            "players": [
              { "name": "Piotr Lisowski", "pdga": 223524, "rating": 901, "score_relative": 16, "rounds": [67, 67], "total": 134, "points": 35.0 },
              { "name": "Marcin Boros", "pdga": 188363, "rating": 860, "score_relative": 16, "rounds": [64, 70], "total": 134, "points": 35.0 }
            ]
          },
          {
            "place": 26,
            "players": [
              { "name": "Florian Nowaczewski", "pdga": 263022, "rating": 838, "score_relative": 17, "rounds": [70, 65], "total": 135, "points": 25.0 },
              { "name": "Kamil Martenka", "pdga": 188407, "rating": 844, "score_relative": 17, "rounds": [64, 71], "total": 135, "points": 25.0 }
            ]
          },
          { "place": 28, "players": [{ "name": "Patryk Pachuc", "pdga": 163749, "rating": 855, "score_relative": 21, "rounds": [67, 72], "total": 139, "points": 15.0 }] },
          { "place": 29, "players": [{ "name": "Maksymilian Palczewski", "pdga": 249485, "rating": 851, "score_relative": 22, "rounds": [66, 74], "total": 140, "points": 10.0 }] },
          { "place": 30, "players": [{ "name": "Witold Wiśniewski", "pdga": 250546, "rating": 797, "score_relative": 26, "rounds": [75, 69], "total": 144, "points": 5.0 }] }
        ]
      },
      {
        "code": "FPO",
        "name": "Pro Open Women",
        "results": [
          { "place": 1, "players": [{ "name": "Barbara Miłosz", "pdga": 235599, "rating": 803, "score_relative": 24, "rounds": [71, 71], "total": 142, "points": 9.0 }] },
          { "place": 2, "players": [{ "name": "Beata Masłowska", "pdga": 280593, "rating": null, "score_relative": 25, "rounds": [76, 67], "total": 143, "points": 6.0 }] },
          { "place": 3, "players": [{ "name": "Marina Zeniuk", "pdga": 149049, "rating": 778, "score_relative": 30, "rounds": [73, 75], "total": 148, "points": 3.0 }] }
        ]
      },
      {
        "code": "MP40",
        "name": "Pro Master 40+",
        "results": [
          { "place": 1, "players": [{ "name": "Marcin Harabin", "pdga": 161877, "rating": 865, "score_relative": 3, "rounds": [60, 61], "total": 121, "points": 40.0 }] },
          { "place": 2, "players": [{ "name": "Mateusz Marciniak", "pdga": 188409, "rating": 870, "score_relative": 5, "rounds": [62, 61], "total": 123, "points": 36.0 }] },
          { "place": 3, "players": [{ "name": "Jakub Nurzaj", "pdga": 223526, "rating": 871, "score_relative": 10, "rounds": [63, 65], "total": 128, "points": 32.0 }] },
          {
            "place": 4,
            "players": [
              { "name": "Kamil Karpala", "pdga": 188406, "rating": 870, "score_relative": 17, "rounds": [70, 65], "total": 135, "points": 28.0 },
              { "name": "Piotr Ratajewski", "pdga": 244909, "rating": 827, "score_relative": 17, "rounds": [70, 65], "total": 135, "points": 28.0 },
              { "name": "Sebastian Śleboda", "pdga": 190563, "rating": 854, "score_relative": 17, "rounds": [66, 69], "total": 135, "points": 28.0 }
            ]
          },
          {
            "place": 7,
            "players": [
              { "name": "Michał Księżuk", "pdga": null, "rating": null, "score_relative": 18, "rounds": [70, 66], "total": 136, "points": 16.0 },
              { "name": "Andrzej Borkowski", "pdga": 198825, "rating": 847, "score_relative": 18, "rounds": [67, 69], "total": 136, "points": 16.0 }
            ]
          },
          { "place": 9, "players": [{ "name": "Michal Gorzkowski", "pdga": 250335, "rating": 854, "score_relative": 22, "rounds": [70, 70], "total": 140, "points": 8.0 }] },
          { "place": 10, "players": [{ "name": "Pawel Cytrynski", "pdga": 274132, "rating": null, "score_relative": 31, "rounds": [76, 73], "total": 149, "points": 4.0 }] }
        ]
      },
      {
        "code": "MA4",
        "name": "Mixed Amateur 4",
        "results": [
          { "place": 1, "players": [{ "name": "Karol Koziatek", "pdga": 161868, "rating": 846, "score_relative": 12, "rounds": [66, 64], "total": 130, "points": 42.0 }] },
          { "place": 2, "players": [{ "name": "Grzegorz Lubczyk", "pdga": 232956, "rating": 836, "score_relative": 12, "rounds": [61, 69], "total": 130, "points": 40.0 }] },
          { "place": 3, "players": [{ "name": "Paweł Szwed", "pdga": 278822, "rating": null, "score_relative": 13, "rounds": [66, 65], "total": 131, "points": 38.0 }] },
          { "place": 4, "players": [{ "name": "Hubert Urbański", "pdga": 249858, "rating": 740, "score_relative": 17, "rounds": [66, 69], "total": 135, "points": 36.0 }] },
          { "place": 5, "players": [{ "name": "Filip Górski", "pdga": 276313, "rating": null, "score_relative": 18, "rounds": [69, 67], "total": 136, "points": 34.0 }] },
          { "place": 6, "players": [{ "name": "Paweł Słotwiński", "pdga": 243500, "rating": 817, "score_relative": 21, "rounds": [66, 73], "total": 139, "points": 32.0 }] },
          { "place": 7, "players": [{ "name": "Kuba Kaługa", "pdga": 249429, "rating": 801, "score_relative": 23, "rounds": [70, 71], "total": 141, "points": 30.0 }] },
          { "place": 8, "players": [{ "name": "Michał Pawlak", "pdga": null, "rating": null, "score_relative": 24, "rounds": [68, 74], "total": 142, "points": 28.0 }] },
          { "place": 9, "players": [{ "name": "Luke Kordys", "pdga": 238558, "rating": 763, "score_relative": 25, "rounds": [72, 71], "total": 143, "points": 26.0 }] },
          {
            "place": 10,
            "players": [
              { "name": "Mikołaj Kuczyński", "pdga": 230483, "rating": 802, "score_relative": 26, "rounds": [75, 69], "total": 144, "points": 24.0 },
              { "name": "Tomasz Obermüller", "pdga": 254408, "rating": 756, "score_relative": 26, "rounds": [70, 74], "total": 144, "points": 24.0 }
            ]
          },
          {
            "place": 12,
            "players": [
              { "name": "Andrzej Połeć", "pdga": 250813, "rating": 822, "score_relative": 28, "rounds": [74, 72], "total": 146, "points": 20.0 },
              { "name": "Marcin Mrzygłód", "pdga": 240558, "rating": 843, "score_relative": 28, "rounds": [72, 74], "total": 146, "points": 20.0 }
            ]
          },
          {
            "place": 14,
            "players": [
              { "name": "Mariusz Maternik", "pdga": null, "rating": null, "score_relative": 29, "rounds": [73, 74], "total": 147, "points": 16.0 },
              { "name": "Kamil Regauer", "pdga": 249855, "rating": 797, "score_relative": 29, "rounds": [70, 77], "total": 147, "points": 16.0 }
            ]
          },
          {
            "place": 16,
            "players": [
              { "name": "Igor Mirowski", "pdga": 160183, "rating": 822, "score_relative": 31, "rounds": [75, 74], "total": 149, "points": 12.0 },
              { "name": "Kacper Szopieraj", "pdga": null, "rating": null, "score_relative": 31, "rounds": [68, 81], "total": 149, "points": 12.0 }
            ]
          },
          { "place": 18, "players": [{ "name": "Tadeusz Maszewski", "pdga": 252775, "rating": 794, "score_relative": 33, "rounds": [71, 80], "total": 151, "points": 8.0 }] },
          { "place": 19, "players": [{ "name": "Axel Starosta", "pdga": 278232, "rating": null, "score_relative": 34, "rounds": [74, 78], "total": 152, "points": 6.0 }] },
          { "place": 20, "players": [{ "name": "Tomasz Skoracki", "pdga": null, "rating": null, "score_relative": 46, "rounds": [83, 81], "total": 164, "points": 4.0 }] },
          { "place": 21, "players": [{ "name": "Jakub Kisielnicki", "pdga": null, "rating": null, "score_relative": 49, "rounds": [83, 84], "total": 167, "points": 2.0 }] }
        ]
      }
    ]
  };

  const roundUrls = [
    "https://discgolfmetrix.com/api.php?content=result&id=2808611", // round1
    "https://discgolfmetrix.com/api.php?content=result&id=2819390", // round2
    "https://discgolfmetrix.com/api.php?content=result&id=2827141", // round3
    "https://discgolfmetrix.com/api.php?content=result&id=2828772", // round4
    "https://discgolfmetrix.com/api.php?content=result&id=2832353", // round5
    round6PDGAData, // round6 (manual)
  ];

  try {
    const combinedResults = await fetchAndProcessResults(roundUrls, pointsByPlace);
    const finalResults = mergeResults(combinedResults);
    res.json(finalResults);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing results");
  }
});
app.get("/results-crl-vol3", async (req, res) => {
  const round6PDGAData = {
    "categories": [
      {
        "code": "MPO",
        "name": "Mixed Pro Open",
        "results": [
          { "place": 1, "players": [{ "name": "Filip Dobranowski", "pdga": 145145, "rating": 941, "score_relative": -4, "rounds": [62, 54], "total": 116, "points": 105.0 }] },
          { "place": 2, "players": [{ "name": "Piotr Borkowski", "pdga": 166228, "rating": 915, "score_relative": 1, "rounds": [62, 59], "total": 121, "points": 100.0 }] },
          { "place": 3, "players": [{ "name": "Jacek Ciechanowski", "pdga": 191107, "rating": 923, "score_relative": 2, "rounds": [62, 60], "total": 122, "points": 95.0 }] },
          { "place": 4, "players": [{ "name": "Antoni Zakroczymski", "pdga": 166233, "rating": 934, "score_relative": 3, "rounds": [63, 60], "total": 123, "points": 90.0 }] },
          { "place": 5, "players": [{ "name": "Bartosz Wiśniewski", "pdga": 226131, "rating": 934, "score_relative": 5, "rounds": [64, 61], "total": 125, "points": 85.0 }] },
          {
            "place": 6,
            "players": [
              { "name": "Dimitris Arapis", "pdga": 220728, "rating": 862, "score_relative": 7, "rounds": [66, 61], "total": 127, "points": 80.0 },
              { "name": "Maksymilian Palczewski", "pdga": 249485, "rating": 898, "score_relative": 7, "rounds": [66, 61], "total": 127, "points": 80.0 }
            ]
          },
          {
            "place": 8,
            "players": [
              { "name": "Robert Hejda", "pdga": 270817, "rating": 897, "score_relative": 8, "rounds": [70, 58], "total": 128, "points": 70.0 },
              { "name": "Michał Majewski", "pdga": 280974, "rating": 906, "score_relative": 8, "rounds": [65, 63], "total": 128, "points": 70.0 },
              { "name": "Maciej Litwinienko", "pdga": 187919, "rating": 925, "score_relative": 8, "rounds": [63, 65], "total": 128, "points": 70.0 },
              { "name": "Filip Mieczykowski", "pdga": 245679, "rating": 905, "score_relative": 8, "rounds": [63, 65], "total": 128, "points": 70.0 }
            ]
          },
          { "place": 12, "players": [{ "name": "Bartlomiej Hilszczanski", "pdga": 142220, "rating": 889, "score_relative": 10, "rounds": [63, 67], "total": 130, "points": 50.0 }] },
          {
            "place": 13,
            "players": [
              { "name": "Bartosz Dworzecki", "pdga": 297160, "rating": null, "score_relative": 11, "rounds": [68, 63], "total": 131, "points": 45.0 },
              { "name": "Miłosz Boruszewski", "pdga": 114341, "rating": 961, "score_relative": 11, "rounds": [64, 67], "total": 131, "points": 45.0 }
            ]
          },
          { "place": 15, "players": [{ "name": "Kamil Tarnecki", "pdga": 241785, "rating": 900, "score_relative": 14, "rounds": [69, 65], "total": 134, "points": 35.0 }] },
          { "place": 16, "players": [{ "name": "Mateusz Ukleja", "pdga": 249433, "rating": 893, "score_relative": 15, "rounds": [68, 67], "total": 135, "points": 30.0 }] },
          { "place": 17, "players": [{ "name": "Florian Nowaczewski", "pdga": 263022, "rating": 868, "score_relative": 16, "rounds": [70, 66], "total": 136, "points": 25.0 }] },
          { "place": 18, "players": [{ "name": "Paweł Szwed", "pdga": 278822, "rating": 887, "score_relative": 20, "rounds": [73, 67], "total": 140, "points": 20.0 }] },
          { "place": 19, "players": [{ "name": "Piotr Chuchla", "pdga": 126869, "rating": 882, "score_relative": 22, "rounds": [71, 71], "total": 142, "points": 15.0 }] },
          { "place": 20, "players": [{ "name": "Kamil Karpala", "pdga": 188406, "rating": 881, "score_relative": 23, "rounds": [74, 69], "total": 143, "points": 10.0 }] },
          { "place": 21, "players": [{ "name": "Adam Genderka", "pdga": 230225, "rating": 871, "score_relative": 28, "rounds": [70, 78], "total": 148, "points": 5.0 }] }
        ]
      },
      {
        "code": "MA3",
        "name": "Mixed Amateur 3",
        "results": [
          { "place": 1, "players": [{ "name": "Filip Górski", "pdga": 276313, "rating": 826, "score_relative": 3, "rounds": [65, 58], "total": 123, "points": 45.0 }] },
          {
            "place": 2,
            "players": [
              { "name": "Kacper Szopieraj", "pdga": 280483, "rating": 875, "score_relative": 8, "rounds": [69, 59], "total": 128, "points": 42.0 },
              { "name": "Mateusz Nitka", "pdga": 283567, "rating": 851, "score_relative": 8, "rounds": [67, 61], "total": 128, "points": 42.0 }
            ]
          },
          { "place": 4, "players": [{ "name": "Piotr Rybarczyk", "pdga": null, "rating": null, "score_relative": 9, "rounds": [60, 69], "total": 129, "points": 36.0 }] },
          {
            "place": 5,
            "players": [
              { "name": "Hubert Urbański", "pdga": 249858, "rating": 844, "score_relative": 14, "rounds": [67, 67], "total": 134, "points": 33.0 },
              { "name": "Patryk Pachuc", "pdga": 163749, "rating": 856, "score_relative": 14, "rounds": [66, 68], "total": 134, "points": 33.0 }
            ]
          },
          {
            "place": 7,
            "players": [
              { "name": "Marek Niedbalski", "pdga": 165191, "rating": 862, "score_relative": 15, "rounds": [71, 64], "total": 135, "points": 27.0 },
              { "name": "Andrzej Borkowski", "pdga": 198825, "rating": 859, "score_relative": 15, "rounds": [68, 67], "total": 135, "points": 27.0 },
              { "name": "Tomasz Obermüller", "pdga": 254408, "rating": 811, "score_relative": 15, "rounds": [66, 69], "total": 135, "points": 27.0 }
            ]
          },
          { "place": 10, "players": [{ "name": "Kamil Martenka", "pdga": 188407, "rating": 839, "score_relative": 16, "rounds": [70, 66], "total": 136, "points": 18.0 }] },
          { "place": 11, "players": [{ "name": "Damian Popiołek", "pdga": 299028, "rating": null, "score_relative": 17, "rounds": [73, 64], "total": 137, "points": 15.0 }] },
          { "place": 12, "players": [{ "name": "Paweł Słotwiński", "pdga": 243500, "rating": 863, "score_relative": 18, "rounds": [72, 66], "total": 138, "points": 12.0 }] },
          { "place": 13, "players": [{ "name": "Sebastian Śleboda", "pdga": 190563, "rating": 862, "score_relative": 19, "rounds": [71, 68], "total": 139, "points": 9.0 }] },
          {
            "place": 14,
            "players": [
              { "name": "Kamil Regauer", "pdga": 249855, "rating": 854, "score_relative": 20, "rounds": [72, 68], "total": 140, "points": 6.0 },
              { "name": "Piotr Ratajewski", "pdga": 244909, "rating": 841, "score_relative": 20, "rounds": [71, 69], "total": 140, "points": 6.0 }
            ]
          }
        ]
      },
      {
        "code": "MA4",
        "name": "Mixed Amateur 4",
        "results": [
          { "place": 1, "players": [{ "name": "Adam Martenka", "pdga": 265178, "rating": 799, "score_relative": 12, "rounds": [67, 65], "total": 132, "points": 50.0 }] },
          { "place": 2, "players": [{ "name": "Patryk Wieckiewicz", "pdga": null, "rating": null, "score_relative": 16, "rounds": [71, 65], "total": 136, "points": 48.0 }] },
          { "place": 3, "players": [{ "name": "Pawel Cytrynski", "pdga": 274132, "rating": 798, "score_relative": 18, "rounds": [72, 66], "total": 138, "points": 46.0 }] },
          { "place": 4, "players": [{ "name": "Artur Domagała", "pdga": null, "rating": null, "score_relative": 21, "rounds": [75, 66], "total": 141, "points": 44.0 }] },
          {
            "place": 5,
            "players": [
              { "name": "Norbert Rutkowski", "pdga": null, "rating": null, "score_relative": 23, "rounds": [77, 66], "total": 143, "points": 42.0 },
              { "name": "Jan Rzepka", "pdga": null, "rating": null, "score_relative": 23, "rounds": [73, 70], "total": 143, "points": 42.0 },
              { "name": "Jakub Kisielnicki", "pdga": 300250, "rating": null, "score_relative": 23, "rounds": [66, 77], "total": 143, "points": 42.0 }
            ]
          },
          { "place": 8, "players": [{ "name": "Grzegorz Osak", "pdga": 302050, "rating": null, "score_relative": 24, "rounds": [69, 75], "total": 144, "points": 36.0 }] },
          { "place": 9, "players": [{ "name": "Max Kuszak", "pdga": null, "rating": null, "score_relative": 25, "rounds": [73, 72], "total": 145, "points": 34.0 }] },
          { "place": 10, "players": [{ "name": "Konrad Przewoźny", "pdga": null, "rating": null, "score_relative": 28, "rounds": [74, 74], "total": 148, "points": 32.0 }] },
          { "place": 11, "players": [{ "name": "Mateusz Kaminski", "pdga": null, "rating": null, "score_relative": 30, "rounds": [75, 75], "total": 150, "points": 30.0 }] },
          { "place": 12, "players": [{ "name": "Filip Grzegorczyk", "pdga": null, "rating": null, "score_relative": 32, "rounds": [76, 76], "total": 152, "points": 28.0 }] },
          {
            "place": 13,
            "players": [
              { "name": "Tadeusz Maszewski", "pdga": 252775, "rating": 790, "score_relative": 34, "rounds": [79, 75], "total": 154, "points": 26.0 },
              { "name": "Borys Dzielicki", "pdga": 276336, "rating": 739, "score_relative": 34, "rounds": [79, 75], "total": 154, "points": 26.0 }
            ]
          },
          {
            "place": 15,
            "players": [
              { "name": "Przemysław Wojt", "pdga": 294623, "rating": 703, "score_relative": 36, "rounds": [81, 75], "total": 156, "points": 22.0 },
              { "name": "Szymon Olejniczak", "pdga": null, "rating": null, "score_relative": 36, "rounds": [79, 77], "total": 156, "points": 22.0 }
            ]
          },
          { "place": 17, "players": [{ "name": "Luke Kordys", "pdga": 238558, "rating": 792, "score_relative": 38, "rounds": [86, 72], "total": 158, "points": 18.0 }] },
          { "place": 18, "players": [{ "name": "Jarek Hnat", "pdga": null, "rating": null, "score_relative": 39, "rounds": [84, 75], "total": 159, "points": 16.0 }] },
          {
            "place": 19,
            "players": [
              { "name": "Beata Masłowska", "pdga": 280593, "rating": 736, "score_relative": 42, "rounds": [78, 84], "total": 162, "points": 14.0 },
              { "name": "Jachu Nowaczewski", "pdga": null, "rating": null, "score_relative": 42, "rounds": [78, 84], "total": 162, "points": 14.0 }
            ]
          },
          { "place": 21, "players": [{ "name": "Paweł Ossig", "pdga": null, "rating": null, "score_relative": 45, "rounds": [85, 80], "total": 165, "points": 10.0 }] },
          { "place": 22, "players": [{ "name": "Patryk Łopatko", "pdga": null, "rating": null, "score_relative": 46, "rounds": [83, 83], "total": 166, "points": 8.0 }] },
          { "place": 23, "players": [{ "name": "Kamil Piętka", "pdga": null, "rating": null, "score_relative": 48, "rounds": [82, 86], "total": 168, "points": 6.0 }] },
          { "place": 24, "players": [{ "name": "Kamil Maciejewski", "pdga": null, "rating": null, "score_relative": 53, "rounds": [83, 90], "total": 173, "points": 4.0 }] },
          { "place": 25, "players": [{ "name": "Michał Kurcin", "pdga": 303055, "rating": null, "score_relative": 57, "rounds": [93, 84], "total": 177, "points": 2.0 }] }
        ]
      }
    ]
  };

  const roundUrls = [
    "https://discgolfmetrix.com/api.php?content=result&id=3154647", // round1
    "https://discgolfmetrix.com/api.php?content=result&id=3178736", // round2
    "https://discgolfmetrix.com/api.php?content=result&id=3187008", // round3
    "https://discgolfmetrix.com/api.php?content=result&id=3193913", // round4
    "https://discgolfmetrix.com/api.php?content=result&id=3204719", // round5
    round6PDGAData, // round6
  ];

  try {
    const combinedResults = await fetchAndProcessResults(roundUrls);
    const finalResults = mergeResults(combinedResults);
    res.json(finalResults);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing results");
  }
});

app.get("/results-crl-vol4", async (req, res) => {
  const roundUrls = [
    "https://discgolfmetrix.com/api.php?content=result&id=3504758", // round1
    "https://discgolfmetrix.com/api.php?content=result&id=3505237", // round2
    "https://discgolfmetrix.com/api.php?content=result&id=3516449", // round3
    // round4 - to be added
    // round5 - to be added
    // round6 - to be added
    // round7 - to be added
  ];

  try {
    const combinedResults = await fetchAndProcessResults(roundUrls);
    const finalResults = mergeResults(combinedResults);
    res.json(finalResults);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing results");
  }
});

// Start server when running locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Export the express app to be used by Vercel as a serverless function
export default app;
