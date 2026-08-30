---
title: Une couche réseau type-safe
date: 2018-04-28
description: De nombreux articles expliquent comment créer une couche réseau type-safe avec Swift. Quelle que soit l’API réseau utilisée, ces approches reposent toutes sur le renvoi du type de données précisément attendu. Dans cet article, nous allons essayer d’aller un peu plus loin en couplant fortement l’endpoint appelé et le type de données attendu.
tags: architecture
image: images/2018-04-28-TypeSafeNetworkLayer/network_layer.png
lang: fr
---

# Un petit rappel

Imaginons que nous souhaitions appeler l’un des endpoints de **dog.ceo**. On commence généralement par définir les routes. Les enums sont parfaits pour cela :

```swift
enum Routes: String {
    case allBreeds = "breeds/list/all"
    case beagles = "beagle/images"
}
```

Le but de cet article n’étant pas d’implémenter une couche réseau entièrement fonctionnelle, nous ne traiterons pas ici les différentes méthodes HTTP ni la personnalisation des headers et des paramètres. Une enum de String est une solution satisfaisante dans notre cas.

Nous définissons ensuite un modèle correspondant à la réponse JSON de l’endpoint **.allBreeds**. Nous utiliserons bien sûr **Codable** pour faciliter sa désérialisation.

```swift
struct Breeds: Codable {
    let status: String
    let message: [String: [String]]
}
```

Voici le modèle représentant l’endpoint **.beagles** :

```swift
struct Beagles: Codable {
    let status: String
    let message: [String]
}
```

Nous pouvons également définir un type **Result** qui encapsulera les données renvoyées par l’endpoint. Comme l’opération peut échouer, **Result** sera une enum représentant soit un succès, soit un échec :

```swift
enum Result<Model> {
    case success(Model)
    case failure(Error)
}
```

Nous pouvons maintenant nous plonger dans le mécanisme de chargement lui-même. Par souci de simplicité, nous utiliserons Alamofire pour exécuter la requête, mais une simple URLSession ferait également l’affaire.

```swift
final class NetworkService {
    let baseURL: String

    init(withBaseURL baseURL: String) {
        self.baseURL = baseURL
    }

    func fetch<Model: Codable> (fromRoute route: Routes,
                                then: @escaping (Result<Model>) -> Void) {

        // Vérifie que le chemin de l’endpoint est une URL valide
        guard let url = URL(string: self.baseURL+route.rawValue) else {
            then(.failure(NSError(domain: "warpfactor.io", code: 500)))
            return
        }

        Alamofire
            .request(url)
            .responseData { (response) in
                guard response.error == nil else {
                    then(.failure(response.error!))
                    return
                }

                if  let data = response.data,
                    let model = try? JSONDecoder().decode(Model.self, from: data) {
                    then(.success(model))
                } else {
                    then(.failure(NSError(  domain: "warpfactor.io",
                                            code: 1000,
                                            userInfo: ["error":"wrong model"])))
                }
        }
    }
}
```

La sûreté des types est assurée par la combinaison de deux fonctionnalités de Swift :

* fonction générique : la syntaxe **fetch&lt;Model: Codable&gt;** indique au compilateur que, dans **Result&lt;Model&gt;**, **Model** sera un sous-type de **Codable**. Une fois le modèle extrait de la valeur **Result.success**, nous avons ainsi la garantie qu’il sera du type attendu ;
* inférence de type : la syntaxe **fetch&lt;Model: Codable&gt;** nous permet également d’instancier **Model**, puisque nous savons qu’il possède nécessairement un initialiseur **Codable**. C’est ce qui rend possible l’instruction **let model = try? JSONDecoder().decode(Model.self, from: data)**.

L’utilisation d’une telle couche réseau est assez simple et directe :

```swift
let networkService = NetworkService(withBaseURL: "https://dog.ceo/api/")

networkService.fetch(fromRoute: Routes.allBreeds) { (result: Result<Breeds>) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

Nous voyons clairement l’inférence de type à l’œuvre : dans le paramètre de la closure, nous indiquons explicitement au compilateur que nous attendons un **Model** de type **Breeds**.

Ce que nous avons réalisé ici est effectivement type-safe, au sens où, si la requête vers l’endpoint **.allBreeds** réussit, nous recevrons à coup sûr une réponse typée **Breeds**.

Mais que se passe-t-il si, tout en continuant à appeler l’endpoint **.allBreeds**, nous remplaçons le type du résultat par **Result&lt;Beagles&gt;** ?

# Pas si sûr !

Du point de vue du compilateur, rien ne se passe. C’est parfaitement valide, car **Beagles** respecte la seule condition exigée par la fonction fetch : être Codable.

Cela signifie qu’il n’existe aucune corrélation entre l’endpoint et son résultat !

Le code suivant compilera, mais échouera à l’exécution :

```swift
networkService.fetch(fromRoute: Routes.allBreeds) { (result: Result<Beagles>) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

Swift est un langage qui favorise la sûreté à la compilation. Il doit donc exister un moyen de garantir la cohérence entre les endpoints et leurs types de retour.

# Rendez votre API plus sûre pour votre équipe

Introduire un défaut de sûreté des types dans votre application ouvre grand la porte aux erreurs et aux bugs que vos coéquipiers finiront certainement par introduire — non par leur faute, mais par la vôtre. En tant qu’architecte applicatif ou concepteur d’API, vous devez fournir à votre équipe un pattern sûr.

Améliorons la situation en quelques étapes.

## Étape 1 : des endpoints génériques

Notre problème provient de l’absence de couplage entre l’endpoint et le modèle qu’il est censé renvoyer. Une structure générique permet de le résoudre facilement :

```swift
struct Route<Model> {
    let endpoint: String
}

struct Routes {
    static let allBreeds = Route<Breeds>(endpoint: "breeds/list/all")
    static let beagles = Route<Beagles>(endpoint: "breed/beagle/images")
}
```

Les routes ne sont plus des enums, mais des structures typées par un Model. Lorsque je déclare une nouvelle Route, je dois donc également préciser le type de modèle qu’elle renverra. Nous avons créé notre couplage !

## Étape 2 : adapter la couche réseau

Nous devons modifier légèrement la fonction fetch, car le type générique n’est plus attaché directement au modèle, mais au modèle de la **Route**.

Nous passons donc de :

```swift
func fetch<Model: Codable> (fromRoute route: Routes,
                            then: @escaping (Result<Model>) -> Void) {
```

à :

```swift
func fetch<Model: Codable> (fromRoute route: Route<Model>,
                            then: @escaping (Result<Model>) -> Void) {
```

## Étape 3 : il ne reste plus qu’à l’utiliser

En couplant simplement l’endpoint au modèle, le compilateur Swift sait ce qu’il doit renvoyer dans le paramètre de la closure. Comme nous le voyons ici, il n’est plus nécessaire de préciser explicitement le type de **result** : ce sera forcément **Breeds**, puisque l’endpoint **.allBreeds** est associé à ce type par définition.

```swift
networkService.fetch(fromRoute: Routes.allBreeds) { (result) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

Pour le prouver, nous pouvons afficher les informations relatives au « model » extrait du résultat : le compilateur sait qu’il s’agit d’un **Breeds** 👍

![](/images/2018-04-28-TypeSafeNetworkLayer/network1.png)

Essayons de mal utiliser le mécanisme : tout en conservant le même endpoint, nous indiquons explicitement au compilateur que le résultat est un **Result&lt;Beagles&gt;**.

![](/images/2018-04-28-TypeSafeNetworkLayer/network2.png)

Comme prévu, cela échoue 👌. Avec seulement quelques modifications mineures de notre API, nous disposons désormais d’une couche réseau réellement type-safe à la compilation 😏. Très sympa.

Merci de m’avoir lu !

À bientôt.
